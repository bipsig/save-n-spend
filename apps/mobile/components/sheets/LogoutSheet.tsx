import { forwardRef } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ConfirmSheet from "./ConfirmSheet";
import { logOut } from "@/lib/profile";
import { logoutBody } from "@/lib/logoutCopy";
import { useOutbox } from "@/store/outbox";
import { usePendingDeletes } from "@/store/pendingDeletes";

// The one logout confirm, for More and Settings (gaps row 105).
const LogoutSheet = forwardRef<BottomSheetModal>((_props, ref) => {
  const unsynced = useOutbox((s) => s.items.length);
  const pending = usePendingDeletes((s) => s.keys.size);
  return (
    <ConfirmSheet
      ref={ref}
      icon="logout"
      title="Log out?"
      body={logoutBody(unsynced, pending)}
      confirmLabel="Log out"
      onConfirm={() => logOut()}
    />
  );
});

LogoutSheet.displayName = "LogoutSheet";

export default LogoutSheet;
