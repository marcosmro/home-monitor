export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    key: (
      <>
        <circle cx="15" cy="8" r="5" />
        <path d="m11.5 11.5-8 8V22H7v-3h3v-3l3-3" />
      </>
    ),
    unlock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M9 10V6a4 4 0 0 1 8 0M12 14v3" />
      </>
    ),
    "shield-half": (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="M12 3v18" />
      </>
    ),
    minus: <path d="M7 12h10" />,
    "door-open": (
      <>
        <path d="M4 21V3h12v18M4 3l9 3v15l-9-3M16 21h4" />
        <path d="M10 12v2" />
      </>
    ),
    "wifi-off": (
      <>
        <path d="m3 3 18 18M3 8a15 15 0 0 1 3-2m5-1a15 15 0 0 1 10 3M6 12a10 10 0 0 1 4-2m5 0a10 10 0 0 1 3 2m-9 4a5 5 0 0 1 6 0" />
        <circle cx="12" cy="20" r=".6" />
      </>
    ),
    temperature: (
      <>
        <path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z" />
        <path d="M12 8v10m6-12h3m-3 4h2" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7v10H3Z" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    window: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M12 3v18M5 12h14" />
      </>
    ),
    motion: (
      <>
        <circle cx="12" cy="6" r="2" />
        <path d="m5 12 6-3 5 4h4M11 9l-2 7-4 4m4-4 7 4M16 3q5 0 5 5" />
      </>
    ),
    smoke: (
      <>
        <ellipse cx="12" cy="16" rx="8" ry="4" />
        <path d="M7 9c-3-3 3-3 0-6m5 6c-3-3 3-3 0-6m5 6c-3-3 3-3 0-6" />
      </>
    ),
    camera: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="3" />
        <circle cx="12" cy="13" r="4" />
        <path d="m8 6 1-3h6l1 3" />
      </>
    ),
    battery: (
      <>
        <rect x="3" y="7" width="16" height="10" rx="2" />
        <path d="M21 10v4M6 10v4m3-4v4m3-4v4" />
      </>
    ),
    wifi: (
      <>
        <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0" />
        <circle cx="12" cy="20" r=".6" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5m0 3v1" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-11v1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
export function deviceIcon(type: string) {
  return type.includes("Contact") || type === "VibrationSensor"
    ? "window"
    : type.includes("Smoke")
      ? "smoke"
      : type.includes("Camera") || type.includes("PIR")
        ? "camera"
        : type.includes("Motion")
          ? "motion"
          : "grid";
}
export function typeLabel(type: string) {
  return (
    (
      {
        MagneticContact: "Contact",
        VibrationSensor: "Contact / shock",
        SmokeDetector: "Smoke",
        InfraredMotionDetector: "Motion",
        CameraPIR: "Camera",
        FloodDetector: "Flood",
        Keypad: "Keypad",
        Siren: "Siren",
      } as Record<string, string>
    )[type] || type
  );
}
