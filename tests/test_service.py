import pytest

from app import service


def test_build_ydl_opts_raises_for_missing_cookies_file(monkeypatch):
    monkeypatch.setattr(service.env, "YTDLP_COOKIES_FILE", "/missing/youtube.txt")

    with pytest.raises(FileNotFoundError):
        service.build_ydl_opts()


def test_build_ydl_opts_uses_existing_cookies_file(monkeypatch, tmp_path):
    cookies_file = tmp_path / "youtube.txt"
    cookies_file.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")
    monkeypatch.setattr(service.env, "YTDLP_COOKIES_FILE", str(cookies_file))

    opts = service.build_ydl_opts()

    assert opts["cookiefile"] == str(cookies_file)
