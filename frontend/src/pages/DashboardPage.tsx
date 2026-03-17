import { PageHeader } from "@/components/layout/PageHeader";

const cards = [
  { title: "Оборудование", value: "0", hint: "Общий реестр будет подключен на следующем этапе." },
  { title: "Активные ремонты", value: "0", hint: "Карточка ремонтов пока в статусе foundation." },
  { title: "СИ на проверке", value: "0", hint: "Arshin workflow будет добавлен отдельным этапом." },
];

export function DashboardPage() {
  return (
    <section>
      <PageHeader
        title="Главная"
        description="Минималистичная стартовая страница с быстрыми переходами и коротким обзором состояния системы."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-3xl border border-line bg-white p-5 shadow-panel">
            <p className="text-sm font-medium text-steel">{card.title}</p>
            <p className="mt-4 text-4xl font-semibold text-ink">{card.value}</p>
            <p className="mt-3 text-sm text-steel">{card.hint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

