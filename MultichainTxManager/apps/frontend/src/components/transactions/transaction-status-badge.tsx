"use client";

import { TRANSACTION_STATUS_CONFIG } from "@mtxm/shared";
import { Badge } from "@/components/ui/badge";
import type { TransactionStatus } from "@mtxm/shared";

interface TransactionStatusBadgeProps {
  status: TransactionStatus;
}

export function TransactionStatusBadge({ status }: TransactionStatusBadgeProps) {
  const config = TRANSACTION_STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className="gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </Badge>
  );
}
