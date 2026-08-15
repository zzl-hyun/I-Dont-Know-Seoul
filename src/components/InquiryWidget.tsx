import { useEffect, useRef, useState } from "react";
import {
  buildInquiryFormUrl,
  INQUIRY_OPTIONS,
  type InquiryCategory,
} from "../lib/inquiry";
import "./InquiryWidget.css";

export default function InquiryWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<InquiryCategory | null>(null);
  const [isFrameLoaded, setIsFrameLoaded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const selectedOption = INQUIRY_OPTIONS.find(
    (option) => option.category === selectedCategory
  );

  const close = () => {
    setIsOpen(false);
    setSelectedCategory(null);
    setIsFrameLoaded(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      if (selectedCategory) iframeRef.current?.focus();
      else firstOptionRef.current?.focus();
    });
  }, [isOpen, selectedCategory]);

  const openCategory = (category: InquiryCategory) => {
    setIsFrameLoaded(false);
    setSelectedCategory(category);
  };

  const goBack = () => {
    setSelectedCategory(null);
    setIsFrameLoaded(false);
  };

  return (
    <div className="inquiry-widget">
      {isOpen && (
        <section
          id="inquiry-panel"
          className="inquiry-panel"
          data-view={selectedCategory ? "form" : "menu"}
          role="dialog"
          aria-modal="false"
          aria-labelledby="inquiry-title"
        >
          <header className="inquiry-head">
            {selectedCategory ? (
              <button
                type="button"
                className="inquiry-icon-btn"
                onClick={goBack}
                aria-label="문의 유형 목록으로 돌아가기"
                title="뒤로"
              >
                <ArrowLeftIcon />
              </button>
            ) : (
              <span className="inquiry-head-icon" aria-hidden="true">
                <ChatIcon />
              </span>
            )}
            <div>
              <h2 id="inquiry-title">
                {selectedOption?.label ?? "무엇을 도와드릴까요?"}
              </h2>
              {!selectedCategory && <p>보내실 의견의 종류를 선택해 주세요.</p>}
            </div>
            <button
              type="button"
              className="inquiry-icon-btn inquiry-head-close"
              onClick={close}
              aria-label="문의 창 닫기"
              title="닫기"
            >
              <CloseIcon />
            </button>
          </header>

          {selectedCategory ? (
            <div className="inquiry-form-view">
              <div className="inquiry-frame-wrap" data-loaded={isFrameLoaded}>
                {!isFrameLoaded && (
                  <div className="inquiry-frame-loading" role="status">
                    <span />
                    문의 폼을 불러오는 중...
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={buildInquiryFormUrl(selectedCategory, true)}
                  title={`${selectedOption?.label ?? "문의"} Google Form`}
                  onLoad={() => setIsFrameLoaded(true)}
                />
              </div>
              <a
                className="inquiry-external-link"
                href={buildInquiryFormUrl(selectedCategory, false)}
                target="_blank"
                rel="noreferrer"
              >
                폼이 보이지 않나요? 새 탭에서 열기
                <ExternalIcon />
              </a>
            </div>
          ) : (
            <ul className="inquiry-options">
              {INQUIRY_OPTIONS.map((option, index) => (
                <li key={option.category}>
                  <button
                    ref={index === 0 ? firstOptionRef : undefined}
                    type="button"
                    onClick={() => openCategory(option.category)}
                  >
                    <span
                      className={`inquiry-option-icon ${option.category}`}
                      aria-hidden="true"
                    >
                      <OptionIcon category={option.category} />
                    </span>
                    <span className="inquiry-option-copy">
                      <b>{option.label}</b>
                      <small>{option.description}</small>
                    </span>
                    <ChevronRightIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        ref={triggerRef}
        type="button"
        className="inquiry-trigger"
        data-open={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-label={isOpen ? "문의 창 닫기" : "문의하기"}
        aria-expanded={isOpen}
        aria-controls="inquiry-panel"
        title={isOpen ? "닫기" : "문의하기"}
      >
        {isOpen ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}

function OptionIcon({ category }: { category: InquiryCategory }) {
  if (category === "feedback") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
        <path d="M7.5 9h9M7.5 12.5h6" />
      </svg>
    );
  }
  if (category === "region") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 1 1 16 0Z" />
        <path d="M9 10h6M12 7v6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4.5M12 17h.01" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5.5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M8 10.8h.01M12 10.8h.01M16 10.8h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="inquiry-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
