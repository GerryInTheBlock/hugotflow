export type UserRole = "admin" | "staff" | "instructor" | "member";

/** Row of public.users (ERD: USERS). */
export type Profile = {
  user_id: string;
  full_name: string;
  email: string | null;
  contact_number: string | null;
  role: UserRole;
  pin: string | null;
  photo_url: string | null;
  birthdate: string | null;
  is_active: boolean;
};

/** Where each role lands after login (Chapter 3: four primary roles). */
export const homeRouteFor = (role: UserRole) => {
  switch (role) {
    case "admin":
      return "/(console)/dashboard" as const;
    case "staff":
      return "/(console)/attendance" as const;
    case "instructor":
      return "/(instructor)/home" as const;
    default:
      return "/(member)/home" as const;
  }
};
