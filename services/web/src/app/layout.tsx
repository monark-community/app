import type { ReactNode } from "react"
import type { Metadata } from "next"
import { TrpcProvider } from "@/lib/trpc-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "Monark",
  description: "Fostering collaboration within the Web3 community.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  )
}
