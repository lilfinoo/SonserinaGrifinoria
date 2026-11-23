"""Check the local portrait and credit required for every character."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

PUBLIC = Path(__file__).resolve().parent / 'public'


def validate_portraits(cards):
    portraits = json.loads((PUBLIC / 'portraits.json').read_text(encoding='utf-8'))
    errors = []
    for card in cards:
        name = card['name']
        portrait = portraits.get(name, {})
        image = portrait.get('url', '')
        source = urlsplit(portrait.get('source', ''))
        if source.scheme != 'https' or not source.hostname:
            errors.append(f'{name}: adicione um link HTTPS para a fonte da imagem.')
        if not re.fullmatch(r'/portraits/[a-zA-Z0-9_-]+\.jpg', image):
            errors.append(f'{name}: indique um retrato JPEG local em public/portraits/.')
            continue
        try:
            with (PUBLIC / image.lstrip('/')).open('rb') as asset:
                is_jpeg = asset.read(3) == b'\xff\xd8\xff'
                asset.seek(-2, 2)
                is_jpeg = is_jpeg and asset.read() == b'\xff\xd9'
        except OSError:
            is_jpeg = False
        if not is_jpeg:
            errors.append(f'{name}: arquivo JPEG ausente ou inválido ({image}).')
    if errors:
        raise SystemExit('\n'.join(errors))


if __name__ == '__main__':
    cards = json.loads((PUBLIC / 'cards.json').read_text(encoding='utf-8'))
    validate_portraits(cards)
    print(f'{len(cards)} personagens com retrato local e fonte.')
