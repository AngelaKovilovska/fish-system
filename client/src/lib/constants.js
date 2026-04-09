export const PARAMETER_LABELS = {
  temperature: { label: 'Температура', unit: '°C' },
  ph: { label: 'pH', unit: '' },
  total_alkalinity: { label: 'Total Alkalinity', unit: 'mg/L' },
  hardness: { label: 'Total Hardness', unit: 'mg/L' },
  nitrates: { label: 'Нитрати (NO₃⁻)', unit: 'mg/L' },
  nitrites: { label: 'Нитрити (NO₂⁻)', unit: 'mg/L' },
  total_chlorine: { label: 'Total Chlorine', unit: 'mg/L' },
  ammonium: { label: 'Амониум (NH₄⁺/NH₃)', unit: 'mg/L' },
};

export const FILTRATION_LABELS = {
  bio_filter_level: 'Ниво на вода во БИО филтер е до обележаното ниво',
  bio_filter_foam: 'Пена во Био филтер',
  mechanical_filter: 'Механички филтер работи нормално',
  circulation_pump: 'Циркулациона пумпа работи нормално',
  thermo_pump: 'Термо пумпа работи нормално',
  aeration: 'Аерација стабилна',
  sieve_filter: 'Сито филтер пред топлотна пумпа - исчистен',
};

export const FISH_VISUAL_LABELS = {
  normal_swimming: 'Нормално пливање',
  no_injuries: 'Нема повреди',
  no_infection: 'Нема црвенило / инфекција',
  normal_appetite: 'Нормален апетит',
  no_dead: 'Нема угинати',
};

export const POOL_NUMBERS = [1, 2, 3, 4, 5, 6];

export const FOOD_TYPES = [
  'Advance (1.5mm)',
  'Pregrower-15 (2mm)',
  'SpecialPro EF (3mm)',
  'Grower-13EF (3mm)',
  'Grower-13EF (4.5mm)',
  'Grower-13EF (6mm)',
];
