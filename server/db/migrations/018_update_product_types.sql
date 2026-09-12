-- Ажурирање на типови производи
-- 1. Ажурирај имиња и осигурај дека сите се активни
UPDATE product_types SET name = 'Риба со глава', is_active = true WHERE code = 'РСГ';
UPDATE product_types SET name = 'Риба без глава', is_active = true WHERE code = 'РБГ';
UPDATE product_types SET name = 'Филета со кожа', is_active = true WHERE code = 'ФСК';
UPDATE product_types SET name = 'Филета без кожа', is_active = true WHERE code = 'ФБК';
UPDATE product_types SET name = 'Делови за чорба', is_active = true WHERE code = 'ДЗЧ';

-- 2. Деактивирај ДР (димена риба) - заменета со ЧР
UPDATE product_types SET is_active = false WHERE code = 'ДР';

-- 3. Додај нови типови
INSERT INTO product_types (code, name, price_per_unit, sort_order) VALUES
  ('ЧР', 'Чадена риба', 0, 5),
  ('ЦР', 'Цела Риба', 0, 7)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, sort_order = EXCLUDED.sort_order;

-- 4. Ажурирај sort_order за правилен редослед
UPDATE product_types SET sort_order = 1 WHERE code = 'РСГ';
UPDATE product_types SET sort_order = 2 WHERE code = 'РБГ';
UPDATE product_types SET sort_order = 3 WHERE code = 'ФСК';
UPDATE product_types SET sort_order = 4 WHERE code = 'ФБК';
UPDATE product_types SET sort_order = 5 WHERE code = 'ЧР';
UPDATE product_types SET sort_order = 6 WHERE code = 'ДЗЧ';
UPDATE product_types SET sort_order = 7 WHERE code = 'ЦР';

-- 5. Додај залиха записи за новите типови
INSERT INTO product_inventory (product_type_id, quantity_kg)
SELECT id, 0 FROM product_types WHERE code IN ('ЧР', 'ЦР')
ON CONFLICT (product_type_id) DO NOTHING;

-- 6. Почетна залиха е преместена во миграција 019 (еднократно извршување)
