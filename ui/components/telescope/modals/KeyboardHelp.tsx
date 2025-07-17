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
        <div className="relative bg-gray-800 border border-gray-600 rounded-lg shadow-lg w-full max-w-2xl mx-4">
          <div className="flex items-start justify-between p-4 border-b border-gray-600 rounded-t">
            <h3 className="text-xl font-semibold text-white">{t("keyboardShortcuts")}</h3>
            <button
              type="button"
              className="text-gray-400 bg-transparent hover:bg-gray-700 hover:text-white rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
              onClick={onClose}
            >
              <XMarkIcon className="h-5 w-5" />
              <span className="sr-only">{t("closeModal")}</span>
            </button>
          </div>
          <div className="p-6 space-y-6">
            <h4 className="text-lg font-semibold text-white">{t("interfaceNavigation")}</h4>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">?</span>
                <span>{t("toggleKeyboardShortcuts")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">/</span>
                <span>{t("focusSearch")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">Ctrl + K</span>
                <span>{t("focusSearch")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">Ctrl + I</span>
                <span>Toggle Picture-in-Picture</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">Ctrl + M</span>
                <span>Minimize/Maximize PiP</span>
              </div>
            </div>

            <h4 className="text-lg font-semibold text-white">{t("videoPlayback")}</h4>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">Spacebar</span>
                <span>{t("playPause")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">→</span>
                <span>{t("forward10Seconds")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">←</span>
                <span>{t("rewind10Seconds")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">↑</span>
                <span>{t("increaseVolume")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">↓</span>
                <span>{t("decreaseVolume")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">M</span>
                <span>{t("toggleMute")}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-white">F</span>
                <span>{t("toggleFullscreen")}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end p-6 border-t border-gray-600 rounded-b">
            <button
              className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
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
