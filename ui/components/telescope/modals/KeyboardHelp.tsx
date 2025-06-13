"use client"

import type React from "react"
import { useTranslation } from "react-i18next"
import { XMarkIcon } from "@heroicons/react/24/outline"

interface KeyboardHelpProps {
  onClose: () => void
}

export const KeyboardHelp: React.FC<KeyboardHelpProps> = ({ onClose }) => {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50">
      <div className="flex items-center justify-center min-h-screen">
        <div className="relative bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4">
          <div className="flex items-start justify-between p-4 border-b rounded-t">
            <h3 className="text-xl font-semibold text-gray-900">{t("keyboardShortcuts")}</h3>
            <button
              type="button"
              className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
              onClick={onClose}
            >
              <XMarkIcon className="h-5 w-5" />
              <span className="sr-only">{t("closeModal")}</span>
            </button>
          </div>
          <div className="p-6 space-y-6">
            <h4 className="text-lg font-semibold">{t("interfaceNavigation")}</h4>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-between">
                <span>?</span>
                <span>{t("toggleKeyboardShortcuts")}</span>
              </div>
              <div className="flex justify-between">
                <span>/</span>
                <span>{t("focusSearch")}</span>
              </div>
              <div className="flex justify-between">
                <span>Ctrl + K</span>
                <span>{t("focusSearch")}</span>
              </div>
              <div className="flex justify-between">
                <span>Ctrl + I</span>
                <span>Toggle Picture-in-Picture</span>
              </div>
              <div className="flex justify-between">
                <span>Ctrl + M</span>
                <span>Minimize/Maximize PiP</span>
              </div>
            </div>

            <h4 className="text-lg font-semibold">{t("videoPlayback")}</h4>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-between">
                <span>Spacebar</span>
                <span>{t("playPause")}</span>
              </div>
              <div className="flex justify-between">
                <span>→</span>
                <span>{t("forward10Seconds")}</span>
              </div>
              <div className="flex justify-between">
                <span>←</span>
                <span>{t("rewind10Seconds")}</span>
              </div>
              <div className="flex justify-between">
                <span>↑</span>
                <span>{t("increaseVolume")}</span>
              </div>
              <div className="flex justify-between">
                <span>↓</span>
                <span>{t("decreaseVolume")}</span>
              </div>
              <div className="flex justify-between">
                <span>M</span>
                <span>{t("toggleMute")}</span>
              </div>
              <div className="flex justify-between">
                <span>F</span>
                <span>{t("toggleFullscreen")}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end p-6 border-t border-gray-200 rounded-b">
            <button
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
              onClick={onClose}
            >
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeyboardHelp
