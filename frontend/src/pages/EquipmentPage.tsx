import { PageHeader } from "@/components/layout/PageHeader";

export function EquipmentPage() {
  return (
    <section>
      <PageHeader
        title="Оборудование"
        description="Foundation-заготовка под папки, группы, фильтрацию и реестр оборудования."
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-ink">Папки и группы</h3>
          <p className="mt-2 text-sm text-steel">
            На следующем этапе здесь появится drill-down по структуре лабораторий и групп оборудования.
          </p>
        </div>
        <div className="rounded-3xl border border-dashed border-line bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-ink">Реестр оборудования</h3>
          <p className="mt-2 text-sm text-steel">
            Эта область зарезервирована под таблицу, поиск, фильтры и быстрый переход в карточку прибора.
          </p>
        </div>
      </div>
    </section>
  );
}

