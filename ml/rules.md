# Program rules for the training set (for the instructors to review)

The decision tree learns from examples labelled by these rules (`ml/labels.py`). They come from published exercise
guidance and the instructors' usual programs (Chapter 3 interview). They are checked top to bottom; the first rule
that matches gives the program. **Please mark anything you would change.**

A limitation "counts" when it is **moderate or severe**. Mild limitations keep the standard program, but the engine
still leaves out exercises that strain that joint.

| # | If… | Program |
| --- | --- | --- |
| R1 | the member reports **pain** today (daily status) | Wellness-Mobility |
| R2 | goal is **Strength** and a knee, lower-back, hip or ankle limitation counts | Strength-Modified-Lower |
| R3 | goal is **Strength** and a shoulder or wrist/elbow limitation counts | Strength-Modified-Upper |
| R4 | goal is **Strength** and age is 60 or more | Strength-Modified-Lower |
| R5 | goal is **Strength** and no rack/bench and no free weights can be used | Strength-Modified-Lower |
| R6 | goal is **Strength** (otherwise) | Strength-Standard |
| R7 | goal is **Weight Loss** and a lower-body limitation counts, or BMI is 32 or more, or age is 55 or more | WeightLoss-LowImpact |
| R8 | goal is **Weight Loss** and no cardio machine can be used | WeightLoss-LowImpact |
| R9 | goal is **Weight Loss** (otherwise) | WeightLoss-Standard |
| R10 | goal is **General Wellness** and any limitation counts, or age is 60 or more | Wellness-Mobility |
| R11 | goal is **General Wellness** and no machines or cables can be used | Wellness-Mobility |
| R12 | goal is **General Wellness** (otherwise) | Wellness-Standard |

## Severity gate (before the tree, Fig 18)

A **severe** limitation, or **pain** reported today, always logs a **High-Risk Alert** for the on-call instructor, and
the member sees the one-tap "Book an instructor" link. The tree still returns a modified routine.

## Sets and reps (Chapter 3 interview)

| Experience | Sets × reps | Rest |
| --- | --- | --- |
| Beginner | 3 × 10 (8–12) | 60 s |
| Intermediate | 3 × 12 | 60 s |
| Advanced | 4 × 12 (12–15) | 60 s |

Modified and mobility programs use the beginner dosage at a light intensity. Soreness today takes one set off each
exercise. Weight-loss programs add cardio (10–20 minutes).
