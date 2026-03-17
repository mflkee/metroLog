export type IconName =
  | "home"
  | "folders"
  | "equipment"
  | "arshin"
  | "verification"
  | "repairs"
  | "refresh"
  | "download"
  | "upload"
  | "message"
  | "settings"
  | "events"
  | "users"
  | "help"
  | "monitor"
  | "today"
  | "plus"
  | "check"
  | "edit"
  | "delete"
  | "details"
  | "share";

type IconProps = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className }: IconProps) {
  const baseClassName = className ?? "h-5 w-5";

  switch (name) {
    case "home":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 9.75V21h13.5V9.75" />
        </svg>
      );
    case "folders":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h5.25l1.5 1.5h9.75v8.25a2.25 2.25 0 0 1-2.25 2.25H5.25A1.5 1.5 0 0 1 3.75 17.25V6.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 14.25h3m3 0h1.5" />
        </svg>
      );
    case "equipment":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15v12h-15z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5h7.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12h7.5M8.25 15.75h4.5" />
        </svg>
      );
    case "arshin":
      return (
        <svg className={baseClassName} data-icon={name} viewBox="0 0 399 208" fill="currentColor">
          <path d="M23 23h22v155H23zm332 0h22v155h-22zm-266 111h23v44H89zm67 0h22v44h-22zm66 0h22v44h-22zm67 0h22v44h-22z" />
          <path
            fillRule="evenodd"
            d="M89 23h22v88H89zm22 0h12c18 0 33 15 33 33s-15 33-33 33h-12zm0 21h10c8 0 14 6 14 12s-6 12-14 12h-10z"
          />
          <path d="M235.92 40.08A37 37 0 1 0 235.92 92.92" fill="none" stroke="currentColor" strokeWidth="23" />
          <path d="M267 23h66v26h-22v62h-22V49h-22z" />
        </svg>
      );
    case "verification":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3v5.25L5.25 18a2.25 2.25 0 0 0 1.98 3.3h9.54a2.25 2.25 0 0 0 1.98-3.3L13.5 8.25V3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 13.5h4.5" />
        </svg>
      );
    case "repairs":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 5.25a4.5 4.5 0 0 0-5.9 5.9L4.5 15v4.5H9l3.85-3.85a4.5 4.5 0 0 0 5.9-5.9l-2.7 2.7-2.55-.45-.45-2.55 2.7-2.7Z" />
        </svg>
      );
    case "refresh":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12a8.25 8.25 0 0 1 14.08-5.83" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.83 3.75v4.92h-4.92" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 12a8.25 8.25 0 0 1-14.08 5.83" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.17 20.25v-4.92h4.92" />
        </svg>
      );
    case "download":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v11.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 11.5 3.75 3.75 3.75-3.75" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5h15" />
        </svg>
      );
    case "upload":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5V8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 11.5 3.75-3.75 3.75 3.75" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5h15" />
        </svg>
      );
    case "message":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18.75 3.75 20.25V6.75A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25v8.5A2.25 2.25 0 0 1 18 17.5H7.5L6 18.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 9.75h9m-9 3h6" />
        </svg>
      );
    case "settings":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 0 1 3.35 0 1.724 1.724 0 0 0 2.573 1.066 1.724 1.724 0 0 1 2.36 2.36 1.724 1.724 0 0 0 1.065 2.573 1.724 1.724 0 0 1 0 3.35 1.724 1.724 0 0 0-1.066 2.573 1.724 1.724 0 0 1-2.36 2.36 1.724 1.724 0 0 0-2.573 1.065 1.724 1.724 0 0 1-3.35 0 1.724 1.724 0 0 0-2.573-1.066 1.724 1.724 0 0 1-2.36-2.36 1.724 1.724 0 0 0-1.065-2.573 1.724 1.724 0 0 1 0-3.35 1.724 1.724 0 0 0 1.066-2.573 1.724 1.724 0 0 1 2.36-2.36 1.724 1.724 0 0 0 2.573-1.065Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z" />
        </svg>
      );
    case "events":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4.5 2.25" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
        </svg>
      );
    case "users":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    case "help":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 2-3 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.25h.008v.008H12z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "monitor":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5v10.5H3.75z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18.75h6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75v3" />
        </svg>
      );
    case "today":
      return (
        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.75" y="5.75" width="16.5" height="14.5" rx="2.25" />
          <path strokeLinecap="round" d="M7.5 3.75v4M16.5 3.75v4M3.75 9.5h16.5" />
          <path fill="currentColor" stroke="none" d="M8.25 13.25h3.5v3.5h-3.5z" />
        </svg>
      );
    case "plus":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
        </svg>
      );
    case "check":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "edit":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.86 3.49 3.65 3.65" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5 8.25 18.75l10.94-10.94a1.875 1.875 0 0 0-2.65-2.65L5.6 16.1 4.5 19.5Z" />
        </svg>
      );
    case "delete":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
        </svg>
      );
    case "details":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25A2.25 2.25 0 1 0 12 9.75a2.25 2.25 0 0 0 0 4.5Z" />
        </svg>
      );
    case "share":
      return (
        <svg className={baseClassName} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12.75 16.5 7.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 11.25 16.5 16.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM18 9.75a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm0 9a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
        </svg>
      );
  }
}
