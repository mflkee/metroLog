import { useParams } from "react-router-dom";

import { PageHeader } from "@/components/layout/PageHeader";

export function EquipmentDetailsPage() {
  const { equipmentId } = useParams();

  return (
    <section>
      <PageHeader
        title={`Карточка прибора ${equipmentId ?? ""}`.trim()}
        description="Карточка прибора будет содержать сводку по оборудованию, заметки, историю изменений и SI-данные."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-steel">
          На foundation-этапе это заготовка под будущую карточку с заметками, автором записи и временем добавления.
        </p>
      </div>
    </section>
  );
}

