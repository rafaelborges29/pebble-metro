#
# This file is the default set of rules to compile a Pebble application.
#
# Feel free to customize this to your needs.
#
import sys

top = '.'
out = 'build'


def options(ctx):
    ctx.load('pebble_sdk')


def configure(ctx):
    """
    This method is used to configure your build. ctx.load(`pebble_sdk`) automatically configures
    a build for each valid platform in `targetPlatforms`. Platform-specific configuration: add your
    change after calling ctx.load('pebble_sdk') and make sure to set the correct environment first.
    Universal configuration: add your change prior to calling ctx.load('pebble_sdk').
    """
    # SDK 4.33.1 rejects prerelease labels even though its native generator reads
    # only major/minor. Adapt its validator for our one development suffix, keeping
    # package files and the emitted PBW label intact. Never modify the installed SDK.
    from waflib import Context
    sys.path.insert(0, ctx.path.abspath())
    from tools.release_package import version_parts
    sdk = Context.load_tool('pebble_sdk')
    validate = sdk._validate_version

    def validate_development_version(conf, version):
        version_parts(version, snapshot=True)
        validate(conf, version.removesuffix('-snapshot'))
        return version

    sdk._validate_version = validate_development_version
    try:
        ctx.load('pebble_sdk')
    finally:
        sdk._validate_version = validate


def build(ctx):
    # Run once before either platform. Track the registry and translation files.
    ctx.add_group('locales')
    ctx.env.LOCALE_PYTHON = [sys.executable]
    ctx(rule='${LOCALE_PYTHON} ${SRC[0].abspath()} ${SRC[1].abspath()} ${TGT}',
        source=['tools/generate_locales.py', 'locales/index.json'] + ctx.path.ant_glob('locales/*.json', excl='locales/index.json'),
        target=['generated/ui_keys.h', 'generated/ui_tables.h'])
    # Compile the phone/shared application before SDK webpack 1 bundles it.
    # Declare every generated file so clean and incremental builds use fresh JS.
    ctx.add_group('phone')
    phone_sources = ctx.path.ant_glob(['src/pkjs/**/*.ts', 'src/common/**/*.ts'])
    phone_json = ctx.path.ant_glob(['src/pkjs/**/*.json', 'locales/index.json'])
    phone_outputs = [ctx.path.get_bld().make_node('phone/' + source.path_from(ctx.path).replace('.ts', '.js'))
                     for source in phone_sources if not source.name.endswith('.d.ts')]
    phone_outputs += [ctx.path.get_bld().make_node('phone/' + source.path_from(ctx.path)) for source in phone_json]
    ctx.env.PHONE_TSC = [ctx.path.find_node('node_modules/.bin/tsc').abspath()]
    ctx(rule='${PHONE_TSC} --project ${SRC[0].abspath()}',
        source=['tsconfig.json', 'package.json', 'package-lock.json'] + phone_sources + phone_json,
        target=phone_outputs)
    ctx.load('pebble_sdk')

    binaries = []

    cached_env = ctx.env
    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        # Ignore stale generated FFI when upgrading an existing Alloy checkout.
        ctx.pbl_build(source=ctx.path.ant_glob('src/c/**/*.c', excl='src/c/mc.ffi.c'), target=app_elf, bin_type='app',
                      includes=[ctx.path.get_bld().make_node('generated')])
        binaries.append({'platform': platform, 'app_elf': app_elf})
    ctx.env = cached_env

    ctx.set_group('bundle')
    # Track the licence files read by the build-time phone notices loader.
    ctx.pbl_bundle(binaries=binaries,
                   js=phone_outputs + ctx.path.ant_glob(['src/pkjs/**/*.cjs',
                                         'LICENSE',
                                         'THIRD_PARTY_NOTICES.md',
                                         'LICENSES/*.txt']),
                   js_entry_file='src/pkjs/bootstrap.cjs')
