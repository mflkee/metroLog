import { PageHeader } from "@/components/layout/PageHeader";

const navigationSteps = [
  {
    title: "Левая панель",
    items: [
      "Основные разделы приложения всегда доступны в левом меню.",
      "Кнопка вверху панели сворачивает меню в компактный режим с одними иконками.",
      "Внизу панели теперь закреплен раздел документации: его удобно открывать как встроенную справку во время работы.",
    ],
  },
  {
    title: "Верхняя панель",
    items: [
      "В правой части оболочки доступны переключение темы и меню учетной записи.",
      "Текущая тема и набор видимых тем настраиваются в разделе «Настройки».",
      "Переход в профиль нужен для изменения контактных данных, пароля и обязательной смены временного пароля после первого входа.",
    ],
  },
];

const functionalSections = [
  {
    title: "Главная",
    description:
      "Аналитическая стартовая страница. Показывает сводку по выбранной папке: статусы оборудования, категории, просрочки, сроки контроля, завершенные процессы, среднюю длительность и последние события.",
    bullets: [
      "Подходит для ежедневного контроля ситуации по папке или подразделению.",
      "Состав виджетов и папка для аналитики задаются в настройках пользователя.",
    ],
  },
  {
    title: "Оборудование",
    description:
      "Основной реестр с папками, группами, фильтрами и поиском. Здесь создаются папки и группы, добавляются обычные приборы, запускаются процессы ремонта и поверки, а также выполняется массовый импорт СИ из Excel.",
    bullets: [
      "Карточка прибора открывается по клику из реестра.",
      "Для СИ предусмотрен отдельный поток через Аршин и импорт сертификатов, а не просто ручное создание записи.",
      "Поддерживаются групповые операции: можно отправлять несколько позиций в ремонт или поверку одной операцией.",
    ],
  },
  {
    title: "Карточка прибора",
    description:
      "Детальная рабочая карточка, где собраны основные данные, вложения, комментарии, активный ремонт, активная поверка, история процессов и SI-данные для средств измерений.",
    bullets: [
      "Из карточки можно редактировать прибор, запускать процессы, обновлять данные СИ и работать с файлами.",
      "Комментарии и процессные сообщения поддерживают эмодзи, автодополнение и упоминания коллег.",
      "Для активных процессов доступны отдельные диалоги ремонта и поверки с файлами и хронологией переписки.",
    ],
  },
  {
    title: "Поверка СИ",
    description:
      "Отдельная рабочая зона для всех поверок: активных, архивных и групповых. Здесь удобно отслеживать маршрут, сроки, сообщения, завершение и переходы в карточки приборов.",
    bullets: [
      "Есть быстрые ссылки в Аршин и в карточки оборудования.",
      "Групповые поверки позволяют объединять несколько СИ в один процесс и вести общий диалог.",
    ],
  },
  {
    title: "Ремонты",
    description:
      "Операционный раздел с активными и архивными ремонтами, маршрутами, этапами, просрочками, оплатой и завершением. Доступны индивидуальные и групповые ремонты.",
    bullets: [
      "Этапы ремонта помогают быстро понять, где сейчас находится прибор и что уже сделано.",
      "Группы ремонта удобны, если несколько приборов отправлены одной партией.",
    ],
  },
  {
    title: "Журнал событий",
    description:
      "Глобальный аудит-лог по оборудованию, ремонтам и поверкам. Удобен для проверки последних изменений и поиска связанных действий.",
    bullets: [
      "Доступен сотрудникам с расширенными правами.",
      "Используйте его как быстрый просмотр истории изменений по всей системе.",
    ],
  },
  {
    title: "Настройки",
    description:
      "Персональные настройки интерфейса. Здесь выбираются папка для аналитики на главной, видимые виджеты, набор доступных тем и опции email-уведомлений по упоминаниям.",
    bullets: [
      "Отсюда же можно отправить тестовое письмо, чтобы проверить работу email-уведомлений.",
      "Если тема скрыта в настройках, она не показывается в верхнем переключателе.",
    ],
  },
  {
    title: "Профиль и пользователи",
    description:
      "Профиль нужен каждому пользователю для обновления личных данных и смены пароля. Раздел «Пользователи» доступен администраторам: там создаются учетные записи, назначаются роли и временные пароли.",
    bullets: [
      "После входа с временным паролем система ведет пользователя в профиль для обязательной смены пароля.",
      "Администратор может просматривать карточки других пользователей и управлять доступом.",
    ],
  },
];

const microFeatures = [
  {
    title: "Автодополнение в полях",
    description:
      "Во многих полях ввода используется единый keyboard-first механизм автодополнения. Он помогает быстро подставлять повторяющиеся значения без ручного набора.",
    bullets: [
      "Стрелки вверх/вниз — перемещение по подсказкам.",
      "Enter или Tab — принять выбранную подсказку.",
      "Esc — закрыть список подсказок.",
      "Можно продолжать свободно печатать: автодополнение не блокирует ручной ввод.",
    ],
  },
  {
    title: "Автодополнение в текстовых сообщениях",
    description:
      "В комментариях, сообщениях ремонта и поверки подсказки работают по токенам текста. Это ускоряет ввод серийных номеров, сертификатов, маршрутов, названий приборов и других часто повторяющихся данных.",
    bullets: [
      "Подсказки появляются прямо в textarea рядом с курсором.",
      "Функция особенно полезна в диалогах по ремонту и поверке, где повторяются объекты, направления и технические формулировки.",
    ],
  },
  {
    title: "Упоминания через @",
    description:
      "Если в комментарии или сообщении набрать символ @, система предложит активных пользователей. После выбора вставится упоминание вида @логин.",
    bullets: [
      "Упоминания работают в комментариях карточки прибора, а также в диалогах ремонта и поверки.",
      "Это позволяет адресно позвать коллегу в конкретный рабочий контекст, а не писать отдельное сообщение вне системы.",
    ],
  },
  {
    title: "Email-уведомления по упоминаниям",
    description:
      "Если пользователь упомянут через @ и у него включены почтовые уведомления, система отправит письмо на его email. Настройка включается и проверяется в разделе «Настройки».",
    bullets: [
      "Перед массовым использованием рекомендуется отправить тестовое письмо из настроек.",
      "Если уведомления выключены у получателя или не настроен почтовый канал, письмо не уйдет, но упоминание в системе останется.",
    ],
  },
  {
    title: "Файлы и вложения",
    description:
      "Вложения можно хранить как на уровне карточки прибора, так и внутри сообщений процессов. Это удобно для актов, сканов, переписки и сопроводительных документов.",
    bullets: [
      "Файлы можно скачивать и удалять в рамках доступных прав.",
      "Вложения привязаны к своему контексту: карточка, ремонт или поверка.",
    ],
  },
];

const workTips = [
  "Начинайте день с «Главной», если нужно быстро увидеть просрочки, ближайшие сроки и последние события по выбранной папке.",
  "Для поиска конкретного прибора используйте «Оборудование», а для детальной работы переходите в карточку прибора.",
  "Если задача связана только с процессом поверки или ремонта, удобнее сразу открывать профильный раздел, а не искать запись через общий реестр.",
  "Настройте видимые темы и почтовые уведомления под себя, чтобы интерфейс и уведомления не мешали ежедневной работе.",
];

const registryListAttributes = [
  ["vri_id", "Идентификатор версии элемента", "Строка", "—", "—"],
  ["org_title", "Наименование организации-поверителя", "Строка", "+", "+"],
  ["mit_number", "Регистрационный номер типа СИ", "Строка", "+", "+"],
  ["mit_title", "Наименование типа СИ", "Строка", "+", "+"],
  ["mit_notation", "Обозначение типа СИ", "Строка", "+", "+"],
  ["mi_modification", "Модификация СИ", "Строка", "+", "+"],
  ["mi_number", "Заводской/серийный номер", "Строка", "+", "+"],
  ["verification_date", "Дата поверки", "Дата", "+", "—"],
  ["valid_date", "Действительна до", "Дата", "+", "—"],
  ["result_docnum", "Номер свидетельства", "Строка", "+", "+"],
  ["sticker_num", "Номер наклейки", "Строка", "+", "+"],
  ["applicability", "Пригодность", "Логический", "+", "—"],
] as const;

const registryDetailSections = [
  {
    title: "miInfo → etaMI",
    rows: [
      ["regNumber", "Регистрационный номер", "Строка"],
      ["mitypeNumber", "Номер типа СИ", "Строка"],
      ["mitypeURL", "URL карточки", "URL"],
      ["mitypeTitle", "Наименование типа", "Строка"],
      ["mitypeType", "Обозначение", "Строка"],
      ["modification", "Модификация", "Строка"],
      ["manufactureNum", "Заводской номер", "Строка"],
      ["manufactureYear", "Год выпуска", "Число"],
    ],
  },
  {
    title: "vriInfo",
    rows: [
      ["organization", "Организация", "Строка"],
      ["signCipher", "Шифр знака", "Строка"],
      ["miOwner", "Владелец", "Строка"],
      ["vrfDate", "Дата поверки", "Дата"],
      ["validDate", "Действительна до", "Дата"],
      ["vriType", "Тип поверки", "Строка"],
      ["docTitle", "Документ", "Строка"],
    ],
    nested: [
      {
        title: "applicable",
        items: ["certNum — номер свидетельства", "stickerNum — номер наклейки", "signPass — знак в паспорте", "signMi — знак на СИ"],
      },
      {
        title: "inapplicable",
        items: ["noticeNum — номер извещения"],
      },
    ],
  },
  {
    title: "means",
    rows: [
      ["npe", "number, title, npeURL", "Блок"],
      ["uve", "number, title, uveURL", "Блок"],
      ["ses", "number, title, manufactureYear, manufactureNum, metroChars", "Блок"],
      ["mieta", "regNumber, mitypeNumber, mitypeTitle, modification, manufactureNum", "Блок"],
      ["mis", "mitypeNumber, mitypeTitle, number", "Блок"],
      ["reagent", "number, type, title", "Блок"],
    ],
  },
  {
    title: "info",
    rows: [
      ["structure", "Состав СИ", "Поле"],
      ["briefIndicator", "Сокращенная поверка", "Поле"],
      ["briefCharacteristics", "Характеристика", "Поле"],
      ["ranges", "Диапазоны", "Поле"],
      ["values", "Значения", "Поле"],
      ["channels", "Каналы", "Поле"],
      ["blocks", "Блоки", "Поле"],
      ["protocol_url", "Ссылка", "Поле"],
      ["additional_info", "Прочее", "Поле"],
    ],
  },
  {
    title: "publication",
    rows: [
      ["status", "Статус", "Поле"],
      ["reason", "Причина", "Поле"],
      ["date", "Дата", "Поле"],
    ],
  },
] as const;

const arshinExampleResponse = `{
  "result": {
    "count": 168142985,
    "start": 0,
    "rows": 10,
    "items": [
      {
        "mit_notation": "ДТС",
        "valid_date": "2021-10-07T12:00:00Z",
        "result_docnum": "Нет данных",
        "org_title": "ООО "ЗАВОД № 423"",
        "mi_number": "09387191044377599",
        "applicability": true,
        "mit_title": "Термометры сопротивления",
        "vri_id": "2-166964556",
        "verification_date": "2019-10-08T12:00:00Z",
        "mit_number": "28354-10"
      }
    ]
  }
}`;

function GuideCard({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <article className="tone-child rounded-3xl border border-line p-5 shadow-panel">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-2 text-sm leading-6 text-steel">{description}</p> : null}
      <ul className="mt-4 space-y-2 text-sm leading-6 text-ink">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-1 text-signal-info">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function TableChip({ children }: { children: string }) {
  return (
    <code className="rounded-full border border-line bg-white/80 px-2 py-1 text-xs font-medium text-ink shadow-sm">
      {children}
    </code>
  );
}

export function HelpPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        title="Документация"
        description="Встроенная инструкция по основным разделам metroLog, рабочим сценариям и мелким функциям интерфейса. Открывай ее из нижней кнопки в левой панели, когда нужен быстрый ответ по работе системы."
      />

      <div className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Как устроена навигация</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {navigationSteps.map((section) => (
            <GuideCard
              key={section.title}
              title={section.title}
              description=""
              bullets={section.items}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {functionalSections.map((section) => (
          <GuideCard
            key={section.title}
            title={section.title}
            description={section.description}
            bullets={section.bullets}
          />
        ))}
      </div>

      <div className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-ink">Аршин: структура данных реестра</h2>
            <p className="max-w-[80ch] text-sm leading-6 text-steel">
              Ниже собрана памятка по полям, которые используются при поиске по реестру поверок и при загрузке детальной карточки одной записи. Блок оформлен как встроенная справка, чтобы его можно было читать прямо в интерфейсе без обращения к внешним заметкам.
            </p>
          </div>
          <div className="tone-child rounded-2xl border border-line px-4 py-3 text-sm text-steel shadow-panel">
            <div className="font-medium text-ink">Структура одного элемента</div>
            <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <span>miInfo</span>
              <span>vriInfo</span>
              <span>means</span>
              <span>info</span>
              <span>publication</span>
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-line">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="tone-child text-left text-xs uppercase tracking-wide text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">№</th>
                  <th className="px-4 py-3 font-medium">Атрибут</th>
                  <th className="px-4 py-3 font-medium">Описание</th>
                  <th className="px-4 py-3 font-medium">Тип</th>
                  <th className="px-4 py-3 font-medium">Search</th>
                  <th className="px-4 py-3 font-medium">Атрибутивный поиск</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/80 bg-[color:var(--panel)] text-ink">
                {registryListAttributes.map((row, index) => (
                  <tr key={row[0]} className="align-top">
                    <td className="px-4 py-3 text-steel">{index + 1}</td>
                    <td className="px-4 py-3"><TableChip>{row[0]}</TableChip></td>
                    <td className="px-4 py-3">{row[1]}</td>
                    <td className="px-4 py-3 text-steel">{row[2]}</td>
                    <td className="px-4 py-3 font-medium text-ink">{row[3]}</td>
                    <td className="px-4 py-3 font-medium text-ink">{row[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
          <article className="tone-child rounded-3xl border border-line p-5 shadow-panel">
            <h3 className="text-base font-semibold text-ink">Пример ответа списка</h3>
            <p className="mt-2 text-sm leading-6 text-steel">
              Используй этот пример как быстрый ориентир по форме ответа: обертка <TableChip>result</TableChip>, счетчики пагинации и массив <TableChip>items</TableChip> с короткими карточками записей.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-[color:var(--app-bg)] p-4 text-xs leading-6 text-ink">
              <code>{arshinExampleResponse}</code>
            </pre>
          </article>

          <article className="tone-child rounded-3xl border border-line p-5 shadow-panel">
            <h3 className="text-base font-semibold text-ink">Короткая памятка по смыслу полей</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-ink">
              <li><span className="font-medium">Поиск списка:</span> в первую очередь полезны организация, номер типа, название типа, обозначение, модификация, серийный номер и номер свидетельства.</li>
              <li><span className="font-medium">Даты:</span> поля поверки и срока действия участвуют в общем поиске, но не отмечены как атрибутивные.</li>
              <li><span className="font-medium">Статус пригодности:</span> <TableChip>applicability</TableChip> помогает быстро отделять пригодные записи от непригодных.</li>
              <li><span className="font-medium">Детализация:</span> полная карточка разбирается на служебные блоки <TableChip>miInfo</TableChip>, <TableChip>vriInfo</TableChip>, <TableChip>means</TableChip>, <TableChip>info</TableChip> и <TableChip>publication</TableChip>.</li>
            </ul>
          </article>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {registryDetailSections.map((section) => (
            <article key={section.title} className="tone-child rounded-3xl border border-line p-5 shadow-panel">
              <h3 className="text-base font-semibold text-ink">{section.title}</h3>
              <div className="mt-4 overflow-hidden rounded-2xl border border-line">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead className="bg-[color:var(--app-bg)] text-left text-xs uppercase tracking-wide text-steel">
                    <tr>
                      <th className="px-4 py-3 font-medium">Атрибут</th>
                      <th className="px-4 py-3 font-medium">Описание</th>
                      <th className="px-4 py-3 font-medium">Тип</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/80">
                    {section.rows.map((row) => (
                      <tr key={row[0]} className="align-top">
                        <td className="px-4 py-3"><TableChip>{row[0]}</TableChip></td>
                        <td className="px-4 py-3 text-ink">{row[1]}</td>
                        <td className="px-4 py-3 text-steel">{row[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {"nested" in section && section.nested ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {section.nested.map((nestedSection) => (
                    <div key={nestedSection.title} className="rounded-2xl border border-dashed border-line px-4 py-3">
                      <div className="text-sm font-medium text-ink">{nestedSection.title}</div>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-steel">
                        {nestedSection.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Мелкие, но важные функции</h2>
        <p className="mt-2 max-w-[72ch] text-sm leading-6 text-steel">
          Ниже собраны возможности, которые часто незаметны при первом знакомстве с системой, но заметно ускоряют повседневную работу.
        </p>
        <div className="mt-4 grid gap-4 2xl:grid-cols-2">
          {microFeatures.map((section) => (
            <GuideCard
              key={section.title}
              title={section.title}
              description={section.description}
              bullets={section.bullets}
            />
          ))}
        </div>
      </div>

      <div className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Рекомендуемый сценарий работы</h2>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-ink">
          {workTips.map((tip, index) => (
            <li key={tip} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-ink shadow-sm">
                {index + 1}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
