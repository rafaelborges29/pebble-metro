"""Run with python3 -m unittest discover -s tools."""
import json
from pathlib import Path
import tempfile
import unittest

from generate_locales import c_string, generate, printf_args


class LocaleTests(unittest.TestCase):
    def render(self, en, pt):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / name for name in ("en.json", "pt-PT.json")]
            for path, value in zip(paths, (en, pt)):
                path.write_text(value if isinstance(value, str) else json.dumps(value), encoding="utf-8")
            return generate(*paths)

    def test_deterministic_order_and_copy(self):
        en = {"menu.favourites": 'Favourites', "about.body": 'A "quote"\\\nÉ?'}
        pt = {"menu.favourites": "Favoritos", "about.body": "Ações"}
        result = self.render(en, pt)
        self.assertEqual(result, self.render(dict(reversed(list(en.items()))), pt))
        self.assertIn("UI_MENU_FAVOURITES", result)
        self.assertIn(c_string(pt["about.body"]), result)
        self.assertEqual(c_string('É"\\\n?0'), '"\\303\\211\\042\\134\\012\\0770"')

    def test_duplicate_keys(self):
        with self.assertRaisesRegex(ValueError, "duplicate key"):
            self.render('{"menu.title":"A","menu.title":"B"}', {"menu.title": "A"})

    def test_missing_extra_keys(self):
        for pt in ({"menu.other": "B"}, {"menu.title": "B", "menu.extra": "C"}):
            with self.subTest(pt=pt), self.assertRaisesRegex(ValueError, "translation keys differ"):
                self.render({"menu.title": "A"}, pt)

    def test_invalid_data(self):
        for data in ([], {}, {"Bad key": "A"}, {"menu.title": 2}, {"menu.title": ""},
                     {"menu.title": "Nul\0"}, {"menu.title": "\ud800"}, {"menu.title": "Tab\t"}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                self.render(data, data)

    def test_identifier_collision(self):
        data = {"menu.a_b": "A", "menu.a.b": "B"}
        with self.assertRaisesRegex(ValueError, "collide"):
            self.render(data, data)

    def test_printf_compatibility(self):
        self.render({"footer.choose": "%d/%d 100%%"}, {"footer.choose": "%02d / %i 100%%"})
        for translated in ("%s/%d", "%d", "%ld/%d", "%u/%d", "%*d/%d", "%d/%d/%d"):
            with self.subTest(translated=translated), self.assertRaisesRegex(ValueError, "incompatible"):
                self.render({"footer.choose": "%d/%d"}, {"footer.choose": translated})
        self.assertEqual(printf_args("%*.*s %.2f"), ["int", "int", ("", "s"), ("", "f")])
        for invalid in ("%n", "%1$d", "%", "%q", "%ls", "%Ld", "%llf", "%5%"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                printf_args(invalid)

    def test_repository_locales(self):
        root = Path(__file__).resolve().parent.parent
        generate(root / "locales/en.json", root / "locales/pt-PT.json")


if __name__ == "__main__":
    unittest.main()
