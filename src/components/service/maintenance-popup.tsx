"use client";

import { useRef, type ReactNode, type SyntheticEvent } from "react";

export function MaintenancePopup({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  function guard(event: SyntheticEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Capture before link navigation, form validation and action handlers.
    const action = event.type === "click" ? target.closest('button, a, input[type="submit"]') : target;
    const blocked = action?.closest('[data-maintenance-blocked="true"]');
    if (!blocked) return;
    event.preventDefault();
    event.stopPropagation();
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.current?.open) dialog.current?.showModal();
  }

  return <>
    <div className="contents" onClickCapture={guard} onSubmitCapture={guard}>{children}</div>
    <dialog ref={dialog} aria-labelledby="maintenance-popup-title" aria-describedby="maintenance-popup-message"
      onClose={() => trigger.current?.focus()}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-sm overflow-y-auto rounded-2xl p-6 shadow-xl backdrop:bg-black/40">
      <h2 id="maintenance-popup-title" className="text-xl font-bold">기능 점검 안내</h2>
      <p id="maintenance-popup-message" className="mt-3 text-zinc-600">현재 점검 중이라 사용할 수 없습니다. 잠시 후 다시 이용해주세요.</p>
      <form method="dialog" className="mt-6"><button autoFocus className="min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">확인</button></form>
    </dialog>
  </>;
}
