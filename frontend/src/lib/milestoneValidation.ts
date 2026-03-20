type MilestoneInput = {
  label: string;
  value: string | null | undefined;
};

type RepairMilestoneValidationInput = {
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string | null | undefined;
  arrivedToDestinationAt: string | null | undefined;
  sentFromRepairAt: string | null | undefined;
  sentFromIrkutskAt: string | null | undefined;
  arrivedToLenskAt: string | null | undefined;
  actuallyReceivedAt: string | null | undefined;
  incomingControlAt: string | null | undefined;
  paidAt: string | null | undefined;
};

type VerificationMilestoneValidationInput = {
  routeDestination: string;
  sentToVerificationAt: string | null | undefined;
  receivedAtDestinationAt: string | null | undefined;
  handedToCsmAt: string | null | undefined;
  verificationCompletedAt: string | null | undefined;
  pickedUpFromCsmAt: string | null | undefined;
  shippedBackAt: string | null | undefined;
  returnedFromVerificationAt: string | null | undefined;
};

export function validateRepairMilestoneOrder(
  input: RepairMilestoneValidationInput,
): string | null {
  return validateMilestoneOrder([
    { label: `Отправлено в ${input.routeDestination}`, value: input.sentToRepairAt },
    { label: `Прибыло в ${input.routeDestination}`, value: input.arrivedToDestinationAt },
    { label: "Ремонт произведен", value: input.sentFromRepairAt },
    { label: `Отправлено в ${input.routeCity}`, value: input.sentFromIrkutskAt },
    { label: `Прибыло в ${input.routeCity}`, value: input.arrivedToLenskAt },
    { label: `Получено в ${input.routeCity}`, value: input.actuallyReceivedAt },
    { label: "Входной контроль выполнен", value: input.incomingControlAt },
    { label: "Оплата выполнена", value: input.paidAt },
  ]);
}

export function validateVerificationMilestoneOrder(
  input: VerificationMilestoneValidationInput,
): string | null {
  return validateMilestoneOrder([
    { label: "Отправлено в поверку", value: input.sentToVerificationAt },
    { label: `Получение в ${input.routeDestination}`, value: input.receivedAtDestinationAt },
    { label: "Передано в ЦСМ", value: input.handedToCsmAt },
    { label: "Поверка выполнена", value: input.verificationCompletedAt },
    { label: "Получено в ЦСМ", value: input.pickedUpFromCsmAt },
    { label: "Упаковано и отправлено обратно", value: input.shippedBackAt },
    { label: "Получено обратно", value: input.returnedFromVerificationAt },
  ]);
}

function validateMilestoneOrder(milestones: readonly MilestoneInput[]): string | null {
  let missingPreviousLabel: string | null = null;
  let previousLabel: string | null = null;
  let previousValue: string | null = null;

  for (const milestone of milestones) {
    const normalizedValue = normalizeDateValue(milestone.value);

    if (!normalizedValue) {
      if (missingPreviousLabel === null) {
        missingPreviousLabel = milestone.label;
      }
      continue;
    }

    if (missingPreviousLabel !== null) {
      return `Этап «${milestone.label}» нельзя указать раньше, чем этап «${missingPreviousLabel}».`;
    }

    if (previousValue !== null && normalizedValue < previousValue && previousLabel !== null) {
      return `Этап «${milestone.label}» не может быть раньше этапа «${previousLabel}».`;
    }

    previousLabel = milestone.label;
    previousValue = normalizedValue;
  }

  return null;
}

function normalizeDateValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
