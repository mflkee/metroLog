import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { EquipmentFolderRefreshRow } from "@/api/equipment/folders";
import { FolderRefreshCandidatePicker } from "@/components/FolderRefreshCandidatePicker";

function buildRow(overrides: Partial<EquipmentFolderRefreshRow> = {}): EquipmentFolderRefreshRow {
  return {
    id: 7,
    taskId: 3,
    equipmentId: 42,
    compositionEntryId: null,
    sortOrder: 1,
    targetKind: "SI",
    moduleKind: null,
    equipmentName: "Термометр",
    equipmentModification: "ТЛ-4",
    equipmentSerialNumber: "841",
    targetTitle: "Термометр",
    targetSerialNumber: "841",
    targetRegistryNumber: null,
    measurementLimit: null,
    currentCertificateNumber: "С-АС/15-07-2026/541665983",
    currentVerificationDate: "2026-07-15T00:00:00",
    currentValidDate: "2029-07-14T00:00:00",
    status: "UPDATED_UNCERTAIN",
    uncertainUpdate: true,
    stage2Successful: true,
    modificationRelaxed: true,
    notationRelaxed: false,
    notes: "Заводской номер в Аршине есть у 2 приборов — выберите нужный.",
    serialAmbiguous: true,
    candidates: [
      {
        vriId: "VRI-OWN",
        mitNumber: "303-91",
        mitTitle: "Термометры ртутные стеклянные лабораторные",
        mitNotation: "ТЛ-4",
        miModification: "мод. ТЛ-4 №2",
        miNumber: "841",
        certificateNumber: "С-АС/22-09-2026/565400067",
        orgTitle: 'ФБУ "ЯКУТСКИЙ ЦСМ"',
        verificationDate: "2026-09-22",
        validDate: "2029-09-21",
        arshinUrl: "https://fgis.gost.ru/fundmetrology/cm/results/VRI-OWN",
      },
      {
        vriId: "VRI-STRANGER",
        mitNumber: "303-91",
        mitTitle: "Термометры ртутные стеклянные лабораторные",
        mitNotation: "ТЛ-4",
        miModification: "мод. ТЛ-4 №2",
        miNumber: "841",
        certificateNumber: "С-АВФ/01-10-2026/565138558",
        orgTitle: 'АО "ТЕРМОПРИБОР"',
        verificationDate: "2026-10-01",
        validDate: "2029-09-30",
        arshinUrl: "https://fgis.gost.ru/fundmetrology/cm/results/VRI-STRANGER",
      },
    ],
    pickedCandidateVriId: null,
    matchedVriId: "VRI-STRANGER",
    matchedArshinUrl: null,
    matchedRegistryNumber: null,
    matchedCertificateNumber: "С-АВФ/01-10-2026/565138558",
    matchedVerificationDate: "2026-10-01T00:00:00",
    matchedValidDate: "2029-09-30T00:00:00",
    createdAt: "2026-10-17T09:00:00",
    updatedAt: "2026-10-17T09:00:00",
    ...overrides,
  };
}

describe("FolderRefreshCandidatePicker", () => {
  it("keeps the note short and opens the candidate list with laboratories", () => {
    render(<FolderRefreshCandidatePicker row={buildRow()} onPick={() => undefined} />);

    // Кнопка выбора есть; список типов в примечание не попадает.
    expect(screen.getByRole("button", { name: "Выбрать прибор (2)" })).toBeInTheDocument();
    expect(screen.queryByText(/4657-12/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Выбрать прибор (2)" }));

    expect(screen.getByText(/ФБУ "ЯКУТСКИЙ ЦСМ"/)).toBeInTheDocument();
    expect(screen.getByText(/АО "ТЕРМОПРИБОР"/)).toBeInTheDocument();
    expect(screen.getByText(/С-АВФ\/01-10-2026\/565138558/)).toBeInTheDocument();
    expect(screen.getByText("предложено поиском")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Выбрать" })).toHaveLength(2);
  });

  it("reports the picked candidate to the caller", () => {
    const onPick = vi.fn();
    render(<FolderRefreshCandidatePicker row={buildRow()} onPick={onPick} />);

    fireEvent.click(screen.getByRole("button", { name: "Выбрать прибор (2)" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Выбрать" })[0]);

    expect(onPick).toHaveBeenCalledWith("VRI-OWN");
  });

  it("shows which candidate is already picked", () => {
    render(
      <FolderRefreshCandidatePicker
        row={buildRow({ pickedCandidateVriId: "VRI-OWN" })}
        onPick={() => undefined}
      />,
    );

    expect(screen.getByText(/Выбрано:/)).toBeInTheDocument();
    expect(screen.getByText(/С-АС\/22-09-2026\/565400067/)).toBeInTheDocument();
  });

  it("renders nothing extra for a row without candidates", () => {
    render(
      <FolderRefreshCandidatePicker
        row={buildRow({ candidates: [], serialAmbiguous: false, pickedCandidateVriId: null })}
        onPick={() => undefined}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
