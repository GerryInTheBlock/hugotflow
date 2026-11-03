# Program rules for the training set (for the instructors to review)

The decision tree learns from examples labelled by these rules (`ml/labels.py`). They come from published exercise
guidance and the instructors' usual programs (Chapter 3 interview). They are checked top to bottom; the first rule
that matches gives the program. **Please mark anything you would change.**

A limitation "counts" when it is **moderate or severe**. Mild limitations keep the standard program, but the engine
still leaves out exercises that strain that joint.

| # | If… | Program | Basis |
| --- | --- | --- | --- |
| R1 | the member reports **pain** today (daily status) | Wellness-Mobility | Pain is a stop/modify signal: screening and referral [10]; exercise kept gentle for painful joints [6][7] |
| R2 | goal is **Strength** and a knee, lower-back, hip or ankle limitation counts | Strength-Modified-Lower | Strengthening is recommended for knee/hip osteoarthritis and low back pain, with low-impact, joint-friendly choices [6][7][8] |
| R3 | goal is **Strength** and a shoulder or wrist/elbow limitation counts | Strength-Modified-Upper | Instructors' usual practice (Chapter 3 interview): pain-free range, machines and lighter loads for the affected arm [1] |
| R4 | goal is **Strength** and age is 60 or more | Strength-Modified-Lower | Resistance training for older adults: machine-led, supervised, gradual progression [5]; age 60 = proponents' threshold, aligned with older-adult guidance [4] |
| R5 | goal is **Strength** and no rack/bench and no free weights can be used | Strength-Modified-Lower | Equipment availability (scope); substitutes from the gym's replacement guide (Appendix 2) |
| R6 | goal is **Strength** (otherwise) | Strength-Standard | Resistance training progression for healthy adults [1] |
| R7 | goal is **Weight Loss** and a lower-body limitation counts, or BMI is 32 or more, or age is 55 or more | WeightLoss-LowImpact | Weight-loss activity guidance [3]; obesity classes from the WHO [9]; low-impact options for knee/hip [6][8]. BMI 32 and age 55 = proponents' thresholds, for the instructors to confirm |
| R8 | goal is **Weight Loss** and no cardio machine can be used | WeightLoss-LowImpact | Equipment availability (scope); circuit alternatives from Appendix 2 |
| R9 | goal is **Weight Loss** (otherwise) | WeightLoss-Standard | 150–250+ min/week of moderate activity plus resistance work for weight loss [3] |
| R10 | goal is **General Wellness** and any limitation counts, or age is 60 or more | Wellness-Mobility | Flexibility and neuromotor (balance) training [2]; balance and multicomponent activity for older adults [4] |
| R11 | goal is **General Wellness** and no machines or cables can be used | Wellness-Mobility | Equipment availability (scope); body-weight mobility work [2] |
| R12 | goal is **General Wellness** (otherwise) | Wellness-Standard | Aerobic + muscle-strengthening + flexibility for healthy adults [2][4] |

## Severity gate (before the tree, Fig 18)

A **severe** limitation, or **pain** reported today, always logs a **High-Risk Alert** for the on-call instructor, and
the member sees the one-tap "Book an instructor" link. The tree still returns a modified routine.

## Sets and reps (Chapter 3 interview; consistent with [1])

| Experience | Sets × reps | Rest |
| --- | --- | --- |
| Beginner | 3 × 10 (8–12) | 60 s |
| Intermediate | 3 × 12 | 60 s |
| Advanced | 4 × 12 (12–15) | 60 s |

Modified and mobility programs use the beginner dosage at a light intensity. Soreness today takes one set off each
exercise. Weight-loss programs add cardio (10–20 minutes).


## Basis of the feature matrix (what the tree reads, and why)

| Attribute in the matrix | Where it comes from in HugotFlow | Why it is an input (basis) |
| --- | --- | --- |
| Age | Birthdate in the health profile (minimum 16) | Older adults need joint-friendly, balance-focused programs [4][5] |
| BMI | Height and weight in the health profile (computed) | IPO model and ERD of the paper; WHO weight classes [9] |
| Fitness goal (Strength, Weight Loss, General Wellness) | Health profile | The three programs in the scope, from the owner and instructors' interview |
| Experience level | Health profile | Dosage depends on training status [1]; listed in Chapter 3 unit testing |
| 6 joint/bone limitations (knee, lower back, shoulder, hip, ankle, wrist/elbow) | Health profile, set by the member and reviewed by the instructor | The paper's scope; exercise guidance per condition [6][7][8] |
| Severity (none, mild, moderate, severe) | Health profile | Severe cases need professional screening first, hence the High-Risk Alert [10] |
| Daily status (good, soreness, pain) | "How is your body today?" before each plan (Fig 13a) | Pain or soreness changes what is safe today [10] |
| Equipment available per group (racks, cardio, cables, machines, free weights) | Equipment Management (Out of Order excluded) | The scope says recommendations use equipment availability; Appendix 2 equipment list |

The 3,000 training rows are synthetic: each row is a random but realistic combination of these attributes, labelled by
the rules R1–R12 above (`ml/generate_dataset.py`, `ml/labels.py`). No real member data is used, as the scope states.

## References

1. American College of Sports Medicine. (2009). Progression models in resistance training for healthy adults. *Medicine & Science in Sports & Exercise, 41*(3), 687–708.
2. Garber, C. E., Blissmer, B., Deschenes, M. R., et al. (2011). Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults. *Medicine & Science in Sports & Exercise, 43*(7), 1334–1359.
3. Donnelly, J. E., Blair, S. N., Jakicic, J. M., et al. (2009). Appropriate physical activity intervention strategies for weight loss and prevention of weight regain for adults. *Medicine & Science in Sports & Exercise, 41*(2), 459–471.
4. Bull, F. C., Al-Ansari, S. S., Biddle, S., et al. (2020). World Health Organization 2020 guidelines on physical activity and sedentary behaviour. *British Journal of Sports Medicine, 54*(24), 1451–1462.
5. Fragala, M. S., Cadore, E. L., Dorgo, S., et al. (2019). Resistance training for older adults: Position statement from the National Strength and Conditioning Association. *Journal of Strength and Conditioning Research, 33*(8), 2019–2052.
6. Kolasinski, S. L., Neogi, T., Hochberg, M. C., et al. (2020). 2019 American College of Rheumatology/Arthritis Foundation guideline for the management of osteoarthritis of the hand, hip, and knee. *Arthritis Care & Research, 72*(2), 149–162.
7. National Institute for Health and Care Excellence. (2016, updated 2020). *Low back pain and sciatica in over 16s: Assessment and management* (NICE Guideline NG59).
8. Bannuru, R. R., Osani, M. C., Vaysbrot, E. E., et al. (2019). OARSI guidelines for the non-surgical management of knee, hip, and polyarticular osteoarthritis. *Osteoarthritis and Cartilage, 27*(11), 1578–1589.
9. World Health Organization. (2000). *Obesity: Preventing and managing the global epidemic* (WHO Technical Report Series 894).
10. Riebe, D., Franklin, B. A., Thompson, P. D., et al. (2015). Updating ACSM's recommendations for exercise preparticipation health screening. *Medicine & Science in Sports & Exercise, 47*(11), 2473–2479.

Check each entry against the original (volume, pages) before it goes into the final manuscript's reference list.
