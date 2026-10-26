# Materiālu cenas (3D kalkulators)

Cenas, ko kalkulators izmanto materiāla izmaksu aprēķinam. Lapā tās vairs netiek rādītas.
Aprēķinā tās nāk no `MATERIALS` objekta failā `js/calculator.js`: ja maini cenu, maini to tur.

| Materiāls    | Cena, €/kg | Blīvums, g/cm³ |
|--------------|-----------:|---------------:|
| PLA          | 17         | 1.24           |
| PETG         | 17         | 1.27           |
| ABS          | 20         | 1.04           |
| TPU          | 20         | 1.21           |
| PC           | 20         | 1.20           |
| Nylon (PA)   | 20         | 1.14           |
| Carbon Fiber | 20         | 1.25           |

Pārējā cenas formula: 3 €/h drukas laiks + materiāls + 10 € faila apstrāde, bez PVN.

Faila nosaukums sākas ar `_`, tāpēc GitHub Pages (Jekyll) to nepublicē mājaslapā.
