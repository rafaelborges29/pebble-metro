"""Private, disposable SDK emulator. JSON-lines IPC; never connects to hardware."""
import base64
import bz2
import io
import json
import logging
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw
from libpebble2.communication import PebbleConnection
from libpebble2.communication.transports.qemu import QemuTransport, MessageTargetQemu
from libpebble2.communication.transports.qemu.protocol import QemuBluetoothConnection, QemuButton
from libpebble2.protocol.apps import AppRunState, AppRunStateStart
from libpebble2.protocol.logs import AppLogMessage, AppLogShippingControl
from libpebble2.protocol.system import TimeMessage, SetUTC
from libpebble2.services.appmessage import AppMessageService, CString
from libpebble2.services.install import AppInstaller
from libpebble2.services.screenshot import Screenshot
from pebble_tool.sdk import sdk_manager

APP = uuid.UUID("5576168a-8b38-4be1-90e7-343af607c167")
output_lock = threading.Lock()


def emit(message):
    with output_lock:
        print(json.dumps(message), flush=True)


def terminate(_signal, _frame):
    raise SystemExit(0)


signal.signal(signal.SIGTERM, terminate)
signal.signal(signal.SIGINT, terminate)
logging.basicConfig(stream=sys.stderr, level=logging.WARNING)


def run():
    platform = sys.argv[1] if len(sys.argv) == 2 else "emery"
    if platform not in ("emery", "gabbro"):
        raise ValueError(f"Unsupported platform: {platform}")
    round_display = platform == "gabbro"
    size = (260, 260) if round_display else (200, 228)
    sdk = Path(sdk_manager.path_for_sdk("4.33.1"))
    toolchain = Path(sdk_manager.root_path_for_sdk("4.33.1")) / "toolchain"
    firmware = sdk / "pebble" / platform / "qemu"
    process = None
    connection = None
    # Each process gets new flash, not the developer's managed emulator storage.
    with tempfile.TemporaryDirectory(prefix="metro-e2e-") as directory:
        directory = Path(directory)
        shutil.copyfile(firmware / "qemu_micro_flash.bin", directory / "micro.bin")
        with bz2.open(firmware / "qemu_spi_flash.bin.bz2", "rb") as source:
            with (directory / "spi.bin").open("wb") as destination:
                shutil.copyfileobj(source, destination)
        try:
            # Hand both bound listeners directly to QEMU. Never release a chosen
            # port before QEMU owns it: concurrent tests cannot steal either one.
            with socket.socket() as serial, socket.socket() as debug:
                for listener in (serial, debug):
                    listener.bind(("127.0.0.1", 0))
                    listener.listen(1)
                port = serial.getsockname()[1]
                debug_port = debug.getsockname()[1]
                command = [
                    str(toolchain / "bin/qemu-pebble"),
                    "-machine", "pebble-" + platform, "-cpu", "cortex-m33",
                    "-kernel", str(directory / "micro.bin"),
                    "-drive", f"if=mtd,format=raw,file={directory / 'spi.bin'}",
                    "-rtc", "base=utc", "-display", "none",
                    "-chardev", f"socket,id=debug,fd={debug.fileno()},server=on,wait=off",
                    "-gdb", "chardev:debug",
                    "-audio", "driver=none,id=audio0",
                    "-chardev", f"socket,id=serial,fd={serial.fileno()},server=on,wait=off",
                    "-serial", "null", "-serial", "chardev:serial",
                    "-serial", "file:" + str(directory / "console.log"),
                ]
                process = subprocess.Popen(command, stdout=sys.stderr, stderr=sys.stderr,
                                           pass_fds=(serial.fileno(), debug.fileno()))
            deadline = time.monotonic() + 30
            while True:
                if process.poll() is not None:
                    raise RuntimeError(f"QEMU exited with status {process.returncode}")
                transport = QemuTransport(port=port)
                try:
                    transport.connect()
                    break
                except Exception:
                    if transport.socket:
                        transport.socket.close()
                    if time.monotonic() >= deadline:
                        raise TimeoutError("QEMU socket did not start")
                    time.sleep(0.1)
            connection = PebbleConnection(transport)
            connection.run_async()
            connection.transport.send_packet(QemuBluetoothConnection(connected=True), MessageTargetQemu())
            service = AppMessageService(connection)
            acknowledgements = {}
            condition = threading.Condition()

            def acknowledged(transaction, _app, ok):
                with condition:
                    acknowledgements[transaction] = ok
                    condition.notify_all()

            service.register_handler("ack", lambda tid, app: acknowledged(tid, app, True))
            service.register_handler("nack", lambda tid, app: acknowledged(tid, app, False))
            service.register_handler("appmessage", lambda _tid, app, data:
                emit({"event": "appmessage", "data": data}) if app == APP else None)
            def app_log(packet):
                print(f"{packet.filename}:{packet.line_number}: {packet.message}", file=sys.stderr, flush=True)
                emit({"event": "log", "message": packet.message})

            connection.register_endpoint(AppLogMessage, app_log)
            connection.send_packet(AppLogShippingControl(enable=True))
            emit({"event": "ready"})
            for line in sys.stdin:
                request = json.loads(line)
                try:
                    method, params = request["method"], request.get("params", {})
                    result = None
                    if method == "install":
                        # SDK's own install command throttles QEMU transfers too.
                        original_send = connection.send_packet

                        def throttled(packet, *args, **kwargs):
                            time.sleep(0.002)
                            return original_send(packet, *args, **kwargs)

                        connection.send_packet = throttled
                        try:
                            AppInstaller(connection, params["path"]).install()
                        finally:
                            connection.send_packet = original_send
                        with ZipFile(params["path"]) as bundle:
                            result = bundle.read("pebble-js-app.js").decode("utf-8")
                    elif method == "locale":
                        # SDK shell stubs hard-code English and disable system language settings.
                        # Set ONLY firmware locale state, leaving the app/API/renderer untouched.
                        # See docs/e2e.md; this does not test the physical settings UI.
                        locale = params["locale"]
                        if locale not in ("pt_PT", "fr_FR"):
                            raise ValueError(f"Unsupported test locale: {locale}")
                        connection.fetch_watch_info()  # Wait for firmware startup/handshake.
                        subprocess.run([
                            str(toolchain / "arm-none-eabi/bin/arm-none-eabi-gdb"),
                            "--nx", "--batch", str(firmware / f"{platform}_sdk_debug.elf"),
                            "-ex", f"target remote 127.0.0.1:{debug_port}",
                            "-ex", f'set variable s_system_domain.iso_locale = "{locale}"',
                            "-ex", "detach",
                        ], check=True, timeout=15, stdout=sys.stderr, stderr=sys.stderr)
                    elif method == "send":
                        transaction = service.send_message(APP, {10000: CString(params["data"])})
                        with condition:
                            if not condition.wait_for(lambda: transaction in acknowledgements, timeout=10):
                                raise TimeoutError("Native AppMessage ACK timed out")
                            if not acknowledgements.pop(transaction):
                                raise RuntimeError("Native AppMessage NACK")
                    elif method == "press":
                        button = {"back": 1, "up": 2, "select": 4, "down": 8}[params["button"]]
                        connection.transport.send_packet(QemuButton(state=button), MessageTargetQemu())
                        time.sleep(0.1)
                        connection.transport.send_packet(QemuButton(state=0), MessageTargetQemu())
                        time.sleep(0.15)
                    elif method == "time":
                        connection.send_packet(TimeMessage(message=SetUTC(unix_time=params["seconds"], utc_offset=0, tz_name="UTC")))
                    elif method == "launch":
                        connection.send_packet(AppRunState(data=AppRunStateStart(uuid=APP)))
                    elif method == "screenshot":
                        rows = Screenshot(connection).grab_image()
                        image = Image.frombytes("RGB", (len(rows[0]) // 3, len(rows)), b"".join(rows))
                        if image.size != size:
                            raise RuntimeError(f"Unexpected {platform} screenshot size: {image.size}")
                        drawing = ImageDraw.Draw(image)
                        if params.get("mask_clock", False):
                            # Snapshot updates must not capture the system launch animation.
                            top = (130, 2) if round_display else (0, 0)
                            bottom = (130, 225) if round_display else (199, 201)
                            if image.getpixel(top) not in ((0, 0, 0), (255, 0, 0), (0, 0, 255), (0, 170, 0), (255, 255, 0)) or image.getpixel(bottom) != (255, 255, 255):
                                raise RuntimeError("Waiting for a rendered Metro frame")
                            drawing.rectangle((170, 24, 209, 47) if round_display else (155, 0, 199, 23), fill=image.getpixel(top))
                        loader_positions = {"empty": (44, 112), "arrivals": (83, 205)} if round_display else {"empty": (10, 85), "arrivals": (10, 182)}
                        loader = params.get("mask_loader")
                        if loader in loader_positions:
                            x, y = loader_positions[loader]
                            drawing.rectangle((x, y, x + 29, y + 17), fill="white")
                        crop = params.get("crop_loader")
                        if crop in loader_positions:
                            x, y = loader_positions[crop]
                            image = image.crop((x, y, x + 30, y + 18))
                        output = io.BytesIO()
                        image.save(output, format="PNG")
                        result = base64.b64encode(output.getvalue()).decode()
                    else:
                        raise ValueError(f"Unknown emulator method: {method}")
                    emit({"id": request["id"], "result": result})
                except Exception as error:
                    emit({"id": request["id"], "error": str(error)})
        finally:
            try:
                if connection:
                    connection.transport.socket.close()
            finally:
                if process:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            console = directory / "console.log"
            if console.exists():
                print(console.read_text(errors="replace"), file=sys.stderr)


if __name__ == "__main__":
    run()
