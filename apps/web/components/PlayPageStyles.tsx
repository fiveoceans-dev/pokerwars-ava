"use client";

export function PlayPageStyles() {
  return (
    <style jsx global>{`
      html,
      body,
      #__next,
      main {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }

      .play-page-container {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: transparent;
      }

      .table-container {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        transform-origin: center center;
        transition: transform 0.3s ease, opacity 0.2s ease;
      }

      .tbtn-mini {
        height: 16px !important;
        padding: 0 6px !important;
        font-size: 6px !important;
        letter-spacing: 0.05em;
        border-radius: 4px !important;
        min-width: 0 !important;
      }
    `}</style>
  );
}
