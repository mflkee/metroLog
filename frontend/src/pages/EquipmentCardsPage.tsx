import { PageHeader } from "@/components/layout/PageHeader";

export function EquipmentCardsPage() {
  return (
    <section>
      <PageHeader
        title="Карточки"
        description="Отдельная рабочая область для быстрого доступа к карточкам приборов."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-steel">
          Здесь появится поиск по ключевым идентификаторам и выдача детальных карточек без массового редактирования.
        </p>
      </div>
    </section>
  );
}

