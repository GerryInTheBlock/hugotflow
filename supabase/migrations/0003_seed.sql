-- HugotFlow · 0003 · Reference data
-- Plans and rates: Chapter 1 Scope (owner interview).
-- Equipment: Appendix 2, "Hugot Gym List of Equipment (as of October 2026)".

insert into public.plans (code, name, price, duration_days, student_discount) values
  ('daily',      'Daily (regular)', 50.00,  1,   0.00),
  ('half_month', 'Half-month',      350.00, 15, 100.00),
  ('monthly',    'Monthly',         700.00, 30, 100.00)
on conflict (code) do nothing;

insert into public.gym_settings (id, walkin_fee, senior_walkin_fee, day_pass_validity_hours, reentry_allowed)
values (1, 50.00, 40.00, 12, true)
on conflict (id) do nothing;

insert into public.equipment (name, category) values
  -- Free weights
  ('Olympic Barbell','Free Weights'),('Powerlifting Bar','Free Weights'),('Deadlift Bar','Free Weights'),
  ('EZ Curl Bar','Free Weights'),('Fixed Barbells','Free Weights'),('Rubber Hex Dumbbells','Free Weights'),
  ('Adjustable Dumbbells','Free Weights'),('Kettlebells','Free Weights'),('Bumper Plates','Free Weights'),
  -- Racks & benches
  ('Power Rack','Racks & Benches'),('Squat Rack','Racks & Benches'),('Half Rack','Racks & Benches'),
  ('Adjustable Bench','Racks & Benches'),('Flat Bench','Racks & Benches'),('Olympic Bench','Racks & Benches'),
  -- Cable / pull machines
  ('Cable Crossover','Cable / Pull Machines'),('Lat Pulldown','Cable / Pull Machines'),('Seated Cable Row','Cable / Pull Machines'),
  ('Single Pulley Machine','Cable / Pull Machines'),('Dual Adjustable Pulley','Cable / Pull Machines'),
  ('Cable Attachments','Cable / Pull Machines'),('Triceps Bar','Cable / Pull Machines'),
  -- Chest
  ('Chest Press Machine','Chest'),('Incline Chest Press','Chest'),('Decline Chest Press','Chest'),
  ('Cable Fly','Chest'),('Smith Machine Bench Press','Chest'),
  -- Back
  ('Chest-Supported Row','Back'),('T-Bar Row','Back'),('Plate-Loaded Row','Back'),
  ('Assisted Pull-Up/Dip Machine','Back'),('Pull-Up Bar','Back'),
  -- Shoulders
  ('Shoulder Press Machine','Shoulders'),('Lateral Raise Machine','Shoulders'),('Rear Delt / Reverse Fly','Shoulders'),
  -- Legs & glutes
  ('Leg Press','Legs & Glutes'),('Leg Extension','Legs & Glutes'),('Seated Leg Curl','Legs & Glutes'),
  ('Hip Adductor','Legs & Glutes'),('Hip Thrust Machine','Legs & Glutes'),('Cable Kickback','Legs & Glutes'),
  -- Cardio
  ('Curved Treadmill','Cardio'),('Electric Treadmill','Cardio'),('Spin Bike','Cardio'),
  ('Stationary Bike','Cardio'),('Rowing Machine','Cardio'),
  -- Core / abs
  ('Ab Wheel','Core / Abs'),('Decline Sit-Up Bench','Core / Abs'),('Stability Ball','Core / Abs'),
  -- Muay Thai / boxing
  ('Heavy Bag','Muay Thai / Boxing'),('Muay Thai Heavy Bag','Muay Thai / Boxing'),('Punching Bag Stand','Muay Thai / Boxing'),
  ('Heavy Bag Gloves','Muay Thai / Boxing'),('Jump Ropes','Muay Thai / Boxing'),
  -- Jiu-jitsu / martial arts
  ('Tatami Mats','Jiu-Jitsu / Martial Arts'),('Grappling Mats','Jiu-Jitsu / Martial Arts'),('Wrestling Dummy','Jiu-Jitsu / Martial Arts'),
  ('Grappling Dummy','Jiu-Jitsu / Martial Arts'),('Agility Ladder','Jiu-Jitsu / Martial Arts')
on conflict (name) do nothing;
