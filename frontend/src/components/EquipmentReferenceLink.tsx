import { Link } from "react-router-dom";

import { Icon } from "@/components/Icon";

type EquipmentReferenceLinkProps = {
  to?: string;
  equipmentId?: number | null;
  name: string;
  modification?: string | null;
  serialNumber?: string | null;
  className?: string;
};

export function EquipmentReferenceLink({
  to,
  equipmentId,
  name,
  modification,
  serialNumber,
  className,
}: EquipmentReferenceLinkProps) {
  const details = [
    modification,
    serialNumber ? `зав. № ${serialNumber}` : null,
  ].filter(Boolean);

  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" name="equipment" />
      <span className="min-w-0">
        <span className="font-medium text-ink">{name}</span>
        {details.length ? (
          <span className="ml-1 text-steel">{details.join(" · ")}</span>
        ) : null}
      </span>
    </>
  );

  const sharedClassName = [
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs transition",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const resolvedTarget = to ?? (equipmentId ? `/equipment/${equipmentId}` : null);

  if (resolvedTarget) {
    return (
      <Link className={`${sharedClassName} text-ink hover:border-signal-info`} to={resolvedTarget}>
        {content}
      </Link>
    );
  }

  return <span className={`${sharedClassName} text-steel`}>{content}</span>;
}
