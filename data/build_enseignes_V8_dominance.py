import os
import json
import re
import unicodedata
from collections import defaultdict
from tqdm import tqdm

EXPORT_FOLDER = "."
OUTPUT_FILE = "enseignes_V8_dominance.json"

# =========================
# TAXONOMIE EXACTE
# =========================

RETAIL_STRUCTURE = {

    "Mode & Accessoires": {
        "subgroups": {
            "Prêt-à-porter Femme": ["clothes"],
            "Prêt-à-porter Homme": ["clothes"],
            "Prêt-à-porter Enfant": ["clothes"],
            "Chaussures": ["shoes"],
            "Maroquinerie": ["bag","leather"],
            "Bijouterie joaillerie": ["jewelry"],
            "Bijouterie fantaisie": ["jewelry"],
            "Horlogerie": ["watches"],
            "Lingerie": ["lingerie"],
            "Accessoires": ["fashion_accessories"],
            "Luxe / Premium": ["clothes"]
        }
    },

    "Beauté & Bien-être": {
        "subgroups": {
            "Cosmétique": ["cosmetics"],
            "Parfumerie": ["perfumery"],
            "Coiffeur": ["hairdresser"],
            "Onglerie": ["beauty"],
            "Institut de beauté": ["beauty"],
            "Massage": ["massage"],
            "Spa": ["spa"]
        }
    },

    "Santé": {
        "subgroups": {
            "Pharmacie": ["pharmacy"],
            "Opticien": ["optician"],
            "Audioprothésiste": ["hearing_aids"],
            "Laboratoire médical": ["clinic"],
            "Maison de santé": ["doctors"],
            "Orthopédie": ["medical_supply"],
            "Parapharmacie": ["cosmetics"]
        }
    },

    "Alimentaire": {
        "subgroups": {
            "Supermarché": ["supermarket"],
            "Hypermarché": ["supermarket"],
            "Supérette": ["convenience"],
            "Boulangerie": ["bakery"],
            "Boucherie": ["butcher"],
            "Fromagerie": ["cheese"],
            "Poissonnerie": ["seafood"],
            "Primeur": ["greengrocer"],
            "Caviste": ["wine"],
            "Chocolatier": ["chocolate"],
            "Bio": ["organic"]
        }
    },

    "Restauration": {
        "subgroups": {
            "Restaurant traditionnel": ["restaurant"],
            "Fast-food": ["fast_food"],
            "Café": ["cafe"],
            "Bar": ["bar"],
            "Glacier": ["ice_cream"],
            "Sandwicherie": ["fast_food"],
            "Pizzeria": ["restaurant"],
            "Sushi": ["restaurant"]
        }
    },

    "Sport & Loisirs": {
        "subgroups": {
            "Salle de sport": ["fitness_centre"],
            "Cycle": ["bicycle"],
            "Outdoor": ["sports"],
            "Sport généraliste": ["sports"],
            "Jeux / Gaming": ["video_games"],
            "Jouets": ["toy"],
            "Musique": ["music"]
        }
    },

    "Maison & Décoration": {
        "subgroups": {
            "Mobilier": ["furniture"],
            "Décoration": ["interior_decoration"],
            "Luminaire": ["lighting"],
            "Bricolage": ["hardware"],
            "Jardin": ["garden_centre"]
        }
    },

    "Culture & Média": {
        "subgroups": {
            "Librairie": ["books"],
            "Presse": ["newsagent"],
            "Photographie": ["photo"],
            "Art": ["art"],
            "Cadeaux": ["gift"]
        }
    },

    "Électronique": {
        "subgroups": {
            "Téléphonie": ["mobile_phone"],
            "Informatique": ["computer"],
            "Hi-Fi": ["electronics"],
            "Électroménager": ["appliance"]
        }
    },

    "Automobile": {
        "subgroups": {
            "Vente auto": ["car"],
            "Réparation": ["car_repair"],
            "Pneus": ["tyres"],
            "Moto": ["motorcycle"],
            "Station-service": ["fuel"]
        }
    },

    "Services": {
        "subgroups": {
            "Agence de voyage": ["travel_agency"],
            "Pressing": ["laundry"],
            "Serrurerie": ["locksmith"],
            "Animalerie": ["pet"],
            "Agence immobilière": ["estate_agent"],
            "Banque": ["bank"],
            "Point relais": ["parcel_shop"],
            "Fleuriste": ["florist"]
        }
    }
}

# =========================
# MAPPING TAG → GROUPE
# =========================

tag_to_groups = defaultdict(list)

for group_name, group_data in RETAIL_STRUCTURE.items():
    for sub_name, tags in group_data["subgroups"].items():
        for tag in tags:
            tag_to_groups[tag].append(group_name)

# =========================
# OUTILS
# =========================

def normalize_name(name):
    name = name.strip()
    name = name.replace("’", "'")
    name = re.sub(r"\s+", " ", name)
    key = unicodedata.normalize('NFD', name)
    key = key.encode('ascii', 'ignore').decode('utf-8')
    key = key.lower()
    return name, key

def split_brands(brand):
    if ";" in brand:
        return [b.strip() for b in brand.split(";") if b.strip()]
    return [brand.strip()]

def extract_group(tags):
    for field in ["shop", "amenity", "leisure"]:
        tag = tags.get(field)
        if tag and tag in tag_to_groups:
            return tag_to_groups[tag][0]
    return None

# =========================
# DOMINANCE NATIONALE
# =========================

files = [f for f in os.listdir(EXPORT_FOLDER)
         if f.startswith("export_") and f.endswith(".json")]

brand_group_counts = defaultdict(lambda: defaultdict(int))
brand_total_counts = defaultdict(int)
brand_display = {}

total_objects = 0

for file in files:
    print(f"\nLecture {file}")
    with open(file, "r", encoding="utf-8") as f:
        data = json.load(f)

    for obj in tqdm(data):
        total_objects += 1
        tags = obj.get("tags", {})
        brand = tags.get("brand")
        if not brand:
            continue

        group = extract_group(tags)
        if not group:
            continue

        for b in split_brands(brand):
            display, key = normalize_name(b)
            brand_display[key] = display
            brand_group_counts[key][group] += 1
            brand_total_counts[key] += 1

print("\n==============================")
print(f"Objets analysés : {total_objects}")
print(f"Enseignes détectées : {len(brand_total_counts)}")

final = []

for key in brand_total_counts:
    total = brand_total_counts[key]
    if total == 1:
        continue

    group_counts = brand_group_counts[key]

    dominant_group = sorted(
        group_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )[0][0]

    final.append({
        "name": brand_display[key],
        "activity_group": dominant_group,
        "activity_subgroup": None,
        "count": total
    })

print(f"Enseignes finales (dominance) : {len(final)}")
print("==============================")

final.sort(key=lambda x: x["count"], reverse=True)

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print(f"\n✅ Fichier {OUTPUT_FILE} généré.")