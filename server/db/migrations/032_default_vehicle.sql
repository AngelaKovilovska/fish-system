-- 032: Регистарска ознака на возило за постоечки продажби без ознака
UPDATE sales SET transport_vehicle = 'VE-8779-AF', updated_at = NOW()
WHERE transport_vehicle IS NULL OR TRIM(transport_vehicle) = '';
