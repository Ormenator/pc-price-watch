CREATE TABLE IF NOT EXISTS hardware_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    chipset TEXT NOT NULL DEFAULT '',
    form_factor TEXT NOT NULL DEFAULT '',
    memory TEXT NOT NULL DEFAULT '',
    search_terms TEXT NOT NULL DEFAULT '',
    specs_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (category, name)
);

CREATE INDEX IF NOT EXISTS idx_hardware_catalog_category_name
    ON hardware_catalog(category, name);

CREATE VIRTUAL TABLE IF NOT EXISTS hardware_catalog_fts USING fts5(
    category, name, manufacturer, platform, chipset, form_factor, memory, search_terms, specs_json,
    content='hardware_catalog', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS hardware_catalog_ai AFTER INSERT ON hardware_catalog BEGIN
    INSERT INTO hardware_catalog_fts(rowid, category, name, manufacturer, platform, chipset, form_factor, memory, search_terms, specs_json)
    VALUES (new.id, new.category, new.name, new.manufacturer, new.platform, new.chipset, new.form_factor, new.memory, new.search_terms, new.specs_json);
END;

CREATE TRIGGER IF NOT EXISTS hardware_catalog_ad AFTER DELETE ON hardware_catalog BEGIN
    INSERT INTO hardware_catalog_fts(hardware_catalog_fts, rowid, category, name, manufacturer, platform, chipset, form_factor, memory, search_terms, specs_json)
    VALUES ('delete', old.id, old.category, old.name, old.manufacturer, old.platform, old.chipset, old.form_factor, old.memory, old.search_terms, old.specs_json);
END;

CREATE TRIGGER IF NOT EXISTS hardware_catalog_au AFTER UPDATE ON hardware_catalog BEGIN
    INSERT INTO hardware_catalog_fts(hardware_catalog_fts, rowid, category, name, manufacturer, platform, chipset, form_factor, memory, search_terms, specs_json)
    VALUES ('delete', old.id, old.category, old.name, old.manufacturer, old.platform, old.chipset, old.form_factor, old.memory, old.search_terms, old.specs_json);
    INSERT INTO hardware_catalog_fts(rowid, category, name, manufacturer, platform, chipset, form_factor, memory, search_terms, specs_json)
    VALUES (new.id, new.category, new.name, new.manufacturer, new.platform, new.chipset, new.form_factor, new.memory, new.search_terms, new.specs_json);
END;

INSERT OR IGNORE INTO hardware_catalog
    (category, manufacturer, name, platform, chipset, form_factor, memory, search_terms)
VALUES
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 5090', 'Desktop GPU', 'GeForce RTX 50', 'PCIe add-in card', '32GB GDDR7', 'Blackwell'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 5080', 'Desktop GPU', 'GeForce RTX 50', 'PCIe add-in card', '16GB GDDR7', 'Blackwell'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 5070 Ti', 'Desktop GPU', 'GeForce RTX 50', 'PCIe add-in card', '16GB GDDR7', 'Blackwell'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 5070', 'Desktop GPU', 'GeForce RTX 50', 'PCIe add-in card', '12GB GDDR7', 'Blackwell'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 5060 Ti 16GB', 'Desktop GPU', 'GeForce RTX 50', 'PCIe add-in card', '16GB GDDR7', 'Blackwell'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 5060', 'Desktop GPU', 'GeForce RTX 50', 'PCIe add-in card', '8GB GDDR7', 'Blackwell'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 4090', 'Desktop GPU', 'GeForce RTX 40', 'PCIe add-in card', '24GB GDDR6X', 'Ada Lovelace'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 4080 SUPER', 'Desktop GPU', 'GeForce RTX 40', 'PCIe add-in card', '16GB GDDR6X', 'Ada Lovelace'),
    ('Graphics Cards', 'NVIDIA', 'GeForce RTX 4070 SUPER', 'Desktop GPU', 'GeForce RTX 40', 'PCIe add-in card', '12GB GDDR6X', 'Ada Lovelace'),
    ('Graphics Cards', 'AMD', 'Radeon RX 9070 XT', 'Desktop GPU', 'Radeon RX 9000', 'PCIe add-in card', '16GB GDDR6', 'RDNA 4'),
    ('Graphics Cards', 'AMD', 'Radeon RX 9070', 'Desktop GPU', 'Radeon RX 9000', 'PCIe add-in card', '16GB GDDR6', 'RDNA 4'),
    ('Graphics Cards', 'AMD', 'Radeon RX 7900 XTX', 'Desktop GPU', 'Radeon RX 7000', 'PCIe add-in card', '24GB GDDR6', 'RDNA 3'),
    ('Graphics Cards', 'AMD', 'Radeon RX 7800 XT', 'Desktop GPU', 'Radeon RX 7000', 'PCIe add-in card', '16GB GDDR6', 'RDNA 3'),
    ('Graphics Cards', 'AMD', 'Radeon RX 7700 XT', 'Desktop GPU', 'Radeon RX 7000', 'PCIe add-in card', '12GB GDDR6', 'RDNA 3'),
    ('Graphics Cards', 'AMD', 'Radeon RX 7600 XT', 'Desktop GPU', 'Radeon RX 7000', 'PCIe add-in card', '16GB GDDR6', 'RDNA 3'),
    ('Graphics Cards', 'Intel', 'Arc B580', 'Desktop GPU', 'Intel Arc B', 'PCIe add-in card', '12GB GDDR6', 'Battlemage'),
    ('Graphics Cards', 'Intel', 'Arc B570', 'Desktop GPU', 'Intel Arc B', 'PCIe add-in card', '10GB GDDR6', 'Battlemage'),
    ('Motherboards', 'ASUS', 'ROG Strix X870E-E Gaming WiFi', 'AMD AM5', 'X870E', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'ASUS', 'TUF Gaming X870-Plus WiFi', 'AMD AM5', 'X870', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'ASUS', 'TUF Gaming B850-Plus WiFi', 'AMD AM5', 'B850', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'ASUS', 'TUF Gaming B650-Plus WiFi', 'AMD AM5', 'B650', 'ATX', 'DDR5', 'Ryzen 7000'),
    ('Motherboards', 'MSI', 'MPG X870E Carbon WiFi', 'AMD AM5', 'X870E', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'MSI', 'MAG X870 Tomahawk WiFi', 'AMD AM5', 'X870', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'MSI', 'MAG B850 Tomahawk MAX WiFi', 'AMD AM5', 'B850', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'MSI', 'MAG B650 Tomahawk WiFi', 'AMD AM5', 'B650', 'ATX', 'DDR5', 'Ryzen 7000'),
    ('Motherboards', 'Gigabyte', 'X870E AORUS Master', 'AMD AM5', 'X870E', 'E-ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'Gigabyte', 'B850 AORUS Elite WiFi7', 'AMD AM5', 'B850', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'Gigabyte', 'B650 AORUS Elite AX', 'AMD AM5', 'B650', 'ATX', 'DDR5', 'Ryzen 7000'),
    ('Motherboards', 'ASRock', 'X870E Taichi', 'AMD AM5', 'X870E', 'E-ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'ASRock', 'B850 Steel Legend WiFi', 'AMD AM5', 'B850', 'ATX', 'DDR5', 'Ryzen 9000'),
    ('Motherboards', 'ASUS', 'ROG Maximus Z890 Hero', 'Intel LGA1851', 'Z890', 'ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'ASUS', 'ROG Strix Z890-E Gaming WiFi', 'Intel LGA1851', 'Z890', 'ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'ASUS', 'TUF Gaming B860-Plus WiFi', 'Intel LGA1851', 'B860', 'ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'ASUS', 'ROG Strix Z790-E Gaming WiFi II', 'Intel LGA1700', 'Z790', 'ATX', 'DDR5', 'Core 12th 13th 14th gen'),
    ('Motherboards', 'MSI', 'MEG Z890 ACE', 'Intel LGA1851', 'Z890', 'E-ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'MSI', 'MPG Z890 Carbon WiFi', 'Intel LGA1851', 'Z890', 'ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'MSI', 'MAG Z890 Tomahawk WiFi', 'Intel LGA1851', 'Z890', 'ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'MSI', 'MAG Z790 Tomahawk WiFi', 'Intel LGA1700', 'Z790', 'ATX', 'DDR5', 'Core 12th 13th 14th gen'),
    ('Motherboards', 'Gigabyte', 'Z890 AORUS Master', 'Intel LGA1851', 'Z890', 'E-ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'Gigabyte', 'B860 AORUS Elite WiFi7', 'Intel LGA1851', 'B860', 'ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'Gigabyte', 'Z790 AORUS Elite AX', 'Intel LGA1700', 'Z790', 'ATX', 'DDR5', 'Core 12th 13th 14th gen'),
    ('Motherboards', 'ASRock', 'Z890 Taichi', 'Intel LGA1851', 'Z890', 'E-ATX', 'DDR5', 'Core Ultra 200'),
    ('Motherboards', 'ASRock', 'B860 Steel Legend WiFi', 'Intel LGA1851', 'B860', 'ATX', 'DDR5', 'Core Ultra 200');
