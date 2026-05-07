import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type MailArgs = {
  from: string
  to: string
  subject: string
  text: string
  html?: string
}
const sendMailMock = vi.fn(async (_opts: MailArgs) => ({ messageId: "ok" }))
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }))
const loggerInfoMock = vi.fn()
const loggerErrorMock = vi.fn()

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock,
}))

vi.mock("@monark/common", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const ORIGINAL_SMTP_URL = process.env.SMTP_URL
const ORIGINAL_SMTP_FROM = process.env.SMTP_FROM

beforeEach(() => {
  // The transport is cached at module scope ; resetModules forces a fresh
  // read of SMTP_URL on each test.
  vi.resetModules()
  sendMailMock.mockClear()
  createTransportMock.mockClear()
  loggerInfoMock.mockClear()
  loggerErrorMock.mockClear()
})

afterEach(() => {
  if (ORIGINAL_SMTP_URL === undefined) delete process.env.SMTP_URL
  else process.env.SMTP_URL = ORIGINAL_SMTP_URL
  if (ORIGINAL_SMTP_FROM === undefined) delete process.env.SMTP_FROM
  else process.env.SMTP_FROM = ORIGINAL_SMTP_FROM
})

describe("notifications/email.sendMail (no SMTP configured)", () => {
  it("logs and returns ok=true (log-only) when SMTP_URL is unset", async () => {
    delete process.env.SMTP_URL
    const { sendMail } = await import("../src/server/transport/email")
    const result = await sendMail({ to: "u@example.com", subject: "Hi", text: "Hello" })

    expect(createTransportMock).not.toHaveBeenCalled()
    expect(sendMailMock).not.toHaveBeenCalled()
    expect(loggerInfoMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true })
  })
})

describe("notifications/email.sendMail (SMTP configured)", () => {
  it("creates a transport from SMTP_URL and forwards the message", async () => {
    process.env.SMTP_URL = "smtp://user:pass@localhost:1025"
    process.env.SMTP_FROM = "Test <test@example.com>"
    const { sendMail } = await import("../src/server/transport/email")

    await sendMail({
      to: "u@example.com",
      subject: "Welcome",
      text: "plain body",
      html: "<p>html body</p>",
    })

    expect(createTransportMock).toHaveBeenCalledWith(
      "smtp://user:pass@localhost:1025",
    )
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock.mock.calls[0]?.[0]).toEqual({
      from: "Test <test@example.com>",
      to: "u@example.com",
      subject: "Welcome",
      text: "plain body",
      html: "<p>html body</p>",
    })
  })

  it("falls back to the default From when SMTP_FROM is unset", async () => {
    process.env.SMTP_URL = "smtp://localhost:1025"
    delete process.env.SMTP_FROM
    const { sendMail } = await import("../src/server/transport/email")

    await sendMail({ to: "u@example.com", subject: "S", text: "T" })

    expect(sendMailMock.mock.calls[0]?.[0]?.from).toBe(
      "Monark <noreply@monark.io>",
    )
  })

  it("caches the transport across calls (createTransport invoked once)", async () => {
    process.env.SMTP_URL = "smtp://localhost:1025"
    const { sendMail } = await import("../src/server/transport/email")

    await sendMail({ to: "a@x.com", subject: "1", text: "1" })
    await sendMail({ to: "b@x.com", subject: "2", text: "2" })

    expect(createTransportMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock).toHaveBeenCalledTimes(2)
  })

  it("returns ok=false with a reason when the transport throws", async () => {
    process.env.SMTP_URL = "smtp://localhost:1025"
    sendMailMock.mockRejectedValueOnce(new Error("boom"))
    const { sendMail } = await import("../src/server/transport/email")

    const result = await sendMail({ to: "u@example.com", subject: "S", text: "T" })

    expect(result).toEqual({ ok: false, reason: "boom" })
    expect(loggerErrorMock).toHaveBeenCalledTimes(1)
  })
})
