/// <reference types="vite/client" />
import type { SeraphimApi } from '../../preload'

declare global {
  interface Window {
    seraphim: SeraphimApi
  }
}

export {}
