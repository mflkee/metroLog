export type IconName =
  | "home"
  | "equipment"
  | "verification"
  | "repairs"
  | "settings"
  | "events"
  | "users"
  | "edit"
  | "delete";

type IconProps = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className }: IconProps) {
  const baseClassName = className ?? "h-5 w-5";

  switch (name) {
    case "home":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 9.75V21h13.5V9.75" />
        </svg>
      );
    case "equipment":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15v12h-15z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5h7.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12h7.5M8.25 15.75h4.5" />
        </svg>
      );
    case "verification":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3v5.25L5.25 18a2.25 2.25 0 0 0 1.98 3.3h9.54a2.25 2.25 0 0 0 1.98-3.3L13.5 8.25V3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 13.5h4.5" />
        </svg>
      );
    case "repairs":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 5.25a4.5 4.5 0 0 0-5.9 5.9L4.5 15v4.5H9l3.85-3.85a4.5 4.5 0 0 0 5.9-5.9l-2.7 2.7-2.55-.45-.45-2.55 2.7-2.7Z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 0 1 3.35 0 1.724 1.724 0 0 0 2.573 1.066 1.724 1.724 0 0 1 2.36 2.36 1.724 1.724 0 0 0 1.065 2.573 1.724 1.724 0 0 1 0 3.35 1.724 1.724 0 0 0-1.066 2.573 1.724 1.724 0 0 1-2.36 2.36 1.724 1.724 0 0 0-2.573 1.065 1.724 1.724 0 0 1-3.35 0 1.724 1.724 0 0 0-2.573-1.066 1.724 1.724 0 0 1-2.36-2.36 1.724 1.724 0 0 0-1.065-2.573 1.724 1.724 0 0 1 0-3.35 1.724 1.724 0 0 0 1.066-2.573 1.724 1.724 0 0 1 2.36-2.36 1.724 1.724 0 0 0 2.573-1.065Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z" />
        </svg>
      );
    case "events":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4.5 2.25" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
        </svg>
      );
    case "users":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    case "edit":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.86 3.49 3.65 3.65" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5 8.25 18.75l10.94-10.94a1.875 1.875 0 0 0-2.65-2.65L5.6 16.1 4.5 19.5Z" />
        </svg>
      );
    case "delete":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
        </svg>
      );
  }
}
