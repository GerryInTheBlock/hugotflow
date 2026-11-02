# Recommendation model report — c45-v1

Trained 2026-11-02T09:39:02+00:00 on 2400 examples, tested on 600 (stratified 80/20 split of the synthetic, rule-labelled dataset; see ml/rules.md).
Algorithm: DecisionTreeClassifier(criterion="entropy") — C4.5-style. Best parameters (5-fold GridSearchCV, macro F1): `{'ccp_alpha': 0.001, 'max_depth': 12, 'min_samples_leaf': 1, 'min_samples_split': 20}`. Tree depth 12, 94 leaves.

## Test-set metrics

| Accuracy | Precision (macro) | Recall (macro) | F1 (macro) |
| --- | --- | --- | --- |
| 0.9500 | 0.9189 | 0.9330 | 0.9218 |

```
                         precision    recall  f1-score   support

Strength-Modified-Lower       0.98      0.84      0.90        56
Strength-Modified-Upper       0.67      0.93      0.78        15
      Strength-Standard       0.97      1.00      0.98       160
   WeightLoss-LowImpact       0.97      0.90      0.93        67
    WeightLoss-Standard       0.96      0.98      0.97       120
      Wellness-Mobility       0.96      0.96      0.96        89
      Wellness-Standard       0.93      0.92      0.93        93

               accuracy                           0.95       600
              macro avg       0.92      0.93      0.92       600
           weighted avg       0.95      0.95      0.95       600

```

## Confusion matrix (rows = actual, columns = predicted)

Classes: C1 = Strength-Modified-Lower, C2 = Strength-Modified-Upper, C3 = Strength-Standard, C4 = WeightLoss-LowImpact, C5 = WeightLoss-Standard, C6 = Wellness-Mobility, C7 = Wellness-Standard

| | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **C1** | 47 | 7 | 2 | 0 | 0 | 0 | 0 |
| **C2** | 1 | 14 | 0 | 0 | 0 | 0 | 0 |
| **C3** | 0 | 0 | 160 | 0 | 0 | 0 | 0 |
| **C4** | 0 | 0 | 0 | 60 | 5 | 0 | 2 |
| **C5** | 0 | 0 | 0 | 2 | 118 | 0 | 0 |
| **C6** | 0 | 0 | 0 | 0 | 0 | 85 | 4 |
| **C7** | 0 | 0 | 3 | 0 | 0 | 4 | 86 |

## Gain Ratio per attribute (training split, Formulas 1–4)

Entropy of the training set: 2.6039 bits.

| Attribute | Information gain | Split info | Gain ratio |
| --- | --- | --- | --- |
| goal | 1.2915 | 1.5495 | 0.8335 |
| age (<= 61) | 0.0053 | 0.0178 | 0.2978 |
| severity | 0.4229 | 1.6843 | 0.2511 |
| bmi (<= 39.1) | 0.0013 | 0.0053 | 0.2502 |
| daily_status | 0.2504 | 1.0951 | 0.2287 |
| limit_wrist_elbow | 0.0512 | 0.4406 | 0.1162 |
| cardio_available | 0.0524 | 0.4808 | 0.1090 |
| limit_ankle | 0.0436 | 0.4461 | 0.0978 |
| limit_hip | 0.0439 | 0.4529 | 0.0969 |
| limit_knee | 0.0408 | 0.4309 | 0.0948 |
| limit_lower_back | 0.0318 | 0.4080 | 0.0780 |
| limit_shoulder | 0.0274 | 0.4420 | 0.0621 |
| free_weights_available | 0.0037 | 0.4974 | 0.0075 |
| cables_available | 0.0017 | 0.4846 | 0.0035 |
| racks_available | 0.0014 | 0.4529 | 0.0031 |
| machines_available | 0.0008 | 0.4448 | 0.0017 |
| experience | 0.0023 | 1.4797 | 0.0016 |

## IF-THEN rules of the trained tree

```
|--- goal_strength <= 0.5
|   |--- goal_general_wellness <= 0.5
|   |   |--- daily_status <= 1.5
|   |   |   |--- severity <= 1.5
|   |   |   |   |--- cardio_available <= 0.5
|   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |--- cardio_available >  0.5
|   |   |   |   |   |--- bmi <= 31.9
|   |   |   |   |   |   |--- age <= 54.0
|   |   |   |   |   |   |   |--- bmi <= 24.6
|   |   |   |   |   |   |   |   |--- bmi <= 18.9
|   |   |   |   |   |   |   |   |   |--- bmi <= 18.8
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |   |   |   |--- bmi >  18.8
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |--- bmi >  18.9
|   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |   |--- bmi >  24.6
|   |   |   |   |   |   |   |   |--- bmi <= 25.6
|   |   |   |   |   |   |   |   |   |--- limit_wrist_elbow <= 0.5
|   |   |   |   |   |   |   |   |   |   |--- age <= 25.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |   |   |   |   |--- age >  25.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |   |   |   |--- limit_wrist_elbow >  0.5
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |--- bmi >  25.6
|   |   |   |   |   |   |   |   |   |--- bmi <= 31.7
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |   |   |   |--- bmi >  31.7
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |--- age >  54.0
|   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |--- bmi >  31.9
|   |   |   |   |   |   |--- severity <= 0.5
|   |   |   |   |   |   |   |--- age <= 21.5
|   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |--- age >  21.5
|   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |--- severity >  0.5
|   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |--- severity >  1.5
|   |   |   |   |--- limit_shoulder <= 0.5
|   |   |   |   |   |--- limit_wrist_elbow <= 0.5
|   |   |   |   |   |   |--- machines_available <= 0.5
|   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |--- machines_available >  0.5
|   |   |   |   |   |   |   |--- bmi <= 25.4
|   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |--- bmi >  25.4
|   |   |   |   |   |   |   |   |--- bmi <= 25.6
|   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |--- bmi >  25.6
|   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |--- limit_wrist_elbow >  0.5
|   |   |   |   |   |   |--- limit_knee <= 0.5
|   |   |   |   |   |   |   |--- limit_hip <= 0.5
|   |   |   |   |   |   |   |   |--- limit_lower_back <= 0.5
|   |   |   |   |   |   |   |   |   |--- bmi <= 31.3
|   |   |   |   |   |   |   |   |   |   |--- cardio_available <= 0.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |   |   |--- cardio_available >  0.5
|   |   |   |   |   |   |   |   |   |   |   |--- truncated branch of depth 2
|   |   |   |   |   |   |   |   |   |--- bmi >  31.3
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |--- limit_lower_back >  0.5
|   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |--- limit_hip >  0.5
|   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |--- limit_knee >  0.5
|   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |--- limit_shoulder >  0.5
|   |   |   |   |   |--- cardio_available <= 0.5
|   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |--- cardio_available >  0.5
|   |   |   |   |   |   |--- bmi <= 31.9
|   |   |   |   |   |   |   |--- limit_lower_back <= 0.5
|   |   |   |   |   |   |   |   |--- limit_knee <= 0.5
|   |   |   |   |   |   |   |   |   |--- limit_ankle <= 0.5
|   |   |   |   |   |   |   |   |   |   |--- limit_hip <= 0.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-Standard
|   |   |   |   |   |   |   |   |   |   |--- limit_hip >  0.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |   |--- limit_ankle >  0.5
|   |   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |   |--- limit_knee >  0.5
|   |   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |   |--- limit_lower_back >  0.5
|   |   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |   |   |   |   |--- bmi >  31.9
|   |   |   |   |   |   |   |--- class: WeightLoss-LowImpact
|   |   |--- daily_status >  1.5
|   |   |   |--- age <= 33.5
|   |   |   |   |--- age <= 32.5
|   |   |   |   |   |--- cables_available <= 0.5
|   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |--- cables_available >  0.5
|   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |--- age >  32.5
|   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |--- age >  33.5
|   |   |   |   |--- class: Wellness-Mobility
|   |--- goal_general_wellness >  0.5
|   |   |--- severity <= 1.5
|   |   |   |--- daily_status <= 1.5
|   |   |   |   |--- limit_shoulder <= 0.5
|   |   |   |   |   |--- bmi <= 23.9
|   |   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |   |   |--- bmi >  23.9
|   |   |   |   |   |   |--- bmi <= 24.6
|   |   |   |   |   |   |   |--- cables_available <= 0.5
|   |   |   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |   |   |--- cables_available >  0.5
|   |   |   |   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |   |   |   |--- bmi >  24.6
|   |   |   |   |   |   |   |--- age <= 60.0
|   |   |   |   |   |   |   |   |--- age <= 34.5
|   |   |   |   |   |   |   |   |   |--- age <= 31.5
|   |   |   |   |   |   |   |   |   |   |--- bmi <= 31.3
|   |   |   |   |   |   |   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |   |   |   |   |   |   |   |--- bmi >  31.3
|   |   |   |   |   |   |   |   |   |   |   |--- truncated branch of depth 2
|   |   |   |   |   |   |   |   |   |--- age >  31.5
|   |   |   |   |   |   |   |   |   |   |--- experience_intermediate <= 0.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |   |   |   |   |   |   |   |--- experience_intermediate >  0.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |   |   |   |   |   |--- age >  34.5
|   |   |   |   |   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |   |   |   |   |--- age >  60.0
|   |   |   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |--- limit_shoulder >  0.5
|   |   |   |   |   |--- class: Wellness-Standard
|   |   |   |--- daily_status >  1.5
|   |   |   |   |--- bmi <= 26.2
|   |   |   |   |   |--- bmi <= 26.0
|   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |--- bmi >  26.0
|   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |--- bmi >  26.2
|   |   |   |   |   |--- class: Wellness-Mobility
|   |   |--- severity >  1.5
|   |   |   |--- bmi <= 34.7
|   |   |   |   |--- bmi <= 24.6
|   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |--- bmi >  24.6
|   |   |   |   |   |--- bmi <= 24.7
|   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |--- bmi >  24.7
|   |   |   |   |   |   |--- experience_beginner <= 0.5
|   |   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |   |--- experience_beginner >  0.5
|   |   |   |   |   |   |   |--- bmi <= 28.2
|   |   |   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |   |   |--- bmi >  28.2
|   |   |   |   |   |   |   |   |--- bmi <= 29.5
|   |   |   |   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |   |   |   |   |   |--- bmi >  29.5
|   |   |   |   |   |   |   |   |   |--- class: Wellness-Mobility
|   |   |   |--- bmi >  34.7
|   |   |   |   |--- class: Wellness-Mobility
|--- goal_strength >  0.5
|   |--- severity <= 1.5
|   |   |--- daily_status <= 1.5
|   |   |   |--- free_weights_available <= 0.5
|   |   |   |   |--- racks_available <= 0.5
|   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |--- racks_available >  0.5
|   |   |   |   |   |--- age <= 34.5
|   |   |   |   |   |   |--- age <= 24.5
|   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |--- age >  24.5
|   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |--- age >  34.5
|   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |--- free_weights_available >  0.5
|   |   |   |   |--- age <= 59.0
|   |   |   |   |   |--- age <= 33.5
|   |   |   |   |   |   |--- daily_status <= 0.5
|   |   |   |   |   |   |   |--- bmi <= 20.3
|   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |   |--- bmi >  20.3
|   |   |   |   |   |   |   |   |--- bmi <= 23.3
|   |   |   |   |   |   |   |   |   |--- bmi <= 23.1
|   |   |   |   |   |   |   |   |   |   |--- bmi <= 20.6
|   |   |   |   |   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |   |   |   |   |   |--- bmi >  20.6
|   |   |   |   |   |   |   |   |   |   |   |--- truncated branch of depth 2
|   |   |   |   |   |   |   |   |   |--- bmi >  23.1
|   |   |   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |   |   |--- bmi >  23.3
|   |   |   |   |   |   |   |   |   |--- age <= 19.5
|   |   |   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |   |   |   |--- age >  19.5
|   |   |   |   |   |   |   |   |   |   |--- limit_ankle <= 0.5
|   |   |   |   |   |   |   |   |   |   |   |--- truncated branch of depth 2
|   |   |   |   |   |   |   |   |   |   |--- limit_ankle >  0.5
|   |   |   |   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |--- daily_status >  0.5
|   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |--- age >  33.5
|   |   |   |   |   |   |--- racks_available <= 0.5
|   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |--- racks_available >  0.5
|   |   |   |   |   |   |   |--- bmi <= 23.8
|   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |   |--- bmi >  23.8
|   |   |   |   |   |   |   |   |--- bmi <= 23.9
|   |   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |   |   |--- bmi >  23.9
|   |   |   |   |   |   |   |   |   |--- bmi <= 26.8
|   |   |   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |   |   |   |   |   |--- bmi >  26.8
|   |   |   |   |   |   |   |   |   |   |--- bmi <= 28.8
|   |   |   |   |   |   |   |   |   |   |   |--- truncated branch of depth 2
|   |   |   |   |   |   |   |   |   |   |--- bmi >  28.8
|   |   |   |   |   |   |   |   |   |   |   |--- class: Strength-Standard
|   |   |   |   |--- age >  59.0
|   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |--- daily_status >  1.5
|   |   |   |--- class: Wellness-Mobility
|   |--- severity >  1.5
|   |   |--- daily_status <= 1.5
|   |   |   |--- limit_wrist_elbow <= 0.5
|   |   |   |   |--- limit_shoulder <= 0.5
|   |   |   |   |   |--- severity <= 2.5
|   |   |   |   |   |   |--- age <= 45.5
|   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |   |--- age >  45.5
|   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |--- severity >  2.5
|   |   |   |   |   |   |--- cardio_available <= 0.5
|   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |   |--- cardio_available >  0.5
|   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |--- limit_shoulder >  0.5
|   |   |   |   |   |--- limit_ankle <= 0.5
|   |   |   |   |   |   |--- limit_hip <= 0.5
|   |   |   |   |   |   |   |--- limit_knee <= 0.5
|   |   |   |   |   |   |   |   |--- limit_lower_back <= 0.5
|   |   |   |   |   |   |   |   |   |--- experience_intermediate <= 0.5
|   |   |   |   |   |   |   |   |   |   |--- class: Strength-Modified-Upper
|   |   |   |   |   |   |   |   |   |--- experience_intermediate >  0.5
|   |   |   |   |   |   |   |   |   |   |--- class: Strength-Modified-Upper
|   |   |   |   |   |   |   |   |--- limit_lower_back >  0.5
|   |   |   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |   |   |--- limit_knee >  0.5
|   |   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |   |--- limit_hip >  0.5
|   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |--- limit_ankle >  0.5
|   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |--- limit_wrist_elbow >  0.5
|   |   |   |   |--- limit_ankle <= 0.5
|   |   |   |   |   |--- age <= 25.5
|   |   |   |   |   |   |--- bmi <= 25.7
|   |   |   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |   |   |   |   |--- bmi >  25.7
|   |   |   |   |   |   |   |--- class: Strength-Modified-Upper
|   |   |   |   |   |--- age >  25.5
|   |   |   |   |   |   |--- class: Strength-Modified-Upper
|   |   |   |   |--- limit_ankle >  0.5
|   |   |   |   |   |--- class: Strength-Modified-Lower
|   |   |--- daily_status >  1.5
|   |   |   |--- class: Wellness-Mobility

```
