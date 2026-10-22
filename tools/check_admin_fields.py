"""对比 data/site.yaml 与 admin config.yml 字段，防止后台保存时丢字段。"""
import yaml

CFG = "static/admin/config.yml"
DATA = "data/site.yaml"

cfg = yaml.safe_load(open(CFG, encoding="utf-8"))
data = yaml.safe_load(open(DATA, encoding="utf-8"))

settings = [c for c in cfg["collections"] if c["name"] == "settings"][0]
fields = settings["files"][0]["fields"]


def walk_fields(fields, prefix=""):
    out = []
    for f in fields:
        path = f"{prefix}{f['name']}"
        out.append((path, f))
        if f.get("widget") == "object" and f.get("fields"):
            out.extend(walk_fields(f["fields"], path + "."))
        if f.get("widget") == "list" and f.get("fields"):
            out.append((path + "[]", f))
    return out


def walk_data(node, prefix=""):
    out = []
    if isinstance(node, dict):
        for k, v in node.items():
            out.append(f"{prefix}{k}")
            out.extend(walk_data(v, f"{prefix}{k}."))
    elif isinstance(node, list):
        for item in node:
            out.extend(walk_data(item, prefix))
    return out


cfg_paths = {p for p, _ in walk_fields(fields)}
list_paths = {p[:-2] for p in cfg_paths if p.endswith("[]")}
data_paths = set(walk_data(data))


def covered(path):
    """列表项字段（social.name 等）由 social[] 统一覆盖"""
    if path in cfg_paths:
        return True
    for lp in list_paths:
        if path.startswith(lp + "."):
            return True
    return False


missing_in_cfg = sorted(p for p in data_paths if p and not covered(p))
missing_in_data = sorted(
    p for p in cfg_paths if not p.endswith("[]") and p not in data_paths
)

print("config 字段数:", len(cfg_paths))
print("data 叶子/路径数:", len(data_paths))
print("\n[data 有、后台没有] (保存会丢):")
for p in missing_in_cfg:
    print("  -", p)
print("\n[后台有、data 没有] (会显示空值):")
for p in missing_in_data:
    print("  -", p)
