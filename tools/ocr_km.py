"""OCR the reference screenshots to recover their text content."""
import sys
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
for path in sys.argv[1:]:
    print("=" * 70)
    print("FILE:", path)
    result, _ = engine(path)
    if not result:
        print("  (no text detected)")
        continue
    for item in result:
        box, text, score = item[0], item[1], item[2]
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        print("  [%5.0f,%5.0f]-(%4dx%4d)  %s  %s"
              % (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys), score, text))
    print()
