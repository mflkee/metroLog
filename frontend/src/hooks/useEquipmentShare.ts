import { shareEquipment } from "@/api/equipment/registry";
import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

type UseEquipmentShareParams = {
  token: string | null,
  equipmentId: number,
};

/** Share-link slice of the equipment card: modal state and the share mutation. */
export function useEquipmentShare({
  token,
  equipmentId,
}: UseEquipmentShareParams) {

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<number[]>([]);
  const [shareUserSearchQuery, setShareUserSearchQuery] = useState("");
  const [shareFeedbackMessage, setShareFeedbackMessage] = useState<string | null>(null);



  function closeShareModal(): void {
    setShareModalOpen(false);
    setSelectedShareUserIds([]);
    setShareUserSearchQuery("");
    shareEquipmentMutation.reset();
  }

  const shareEquipmentMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Сессия неактивна. Войди заново.");
      }
      return shareEquipment(token, equipmentId, selectedShareUserIds);
    },
    onSuccess: (result) => {
      setShareFeedbackMessage(result.message);
      closeShareModal();
    },
  });

  return {
    shareModalOpen,
    setShareModalOpen,
    selectedShareUserIds,
    setSelectedShareUserIds,
    shareUserSearchQuery,
    setShareUserSearchQuery,
    shareFeedbackMessage,
    setShareFeedbackMessage,
    shareEquipmentMutation,
    closeShareModal,
  };
}
