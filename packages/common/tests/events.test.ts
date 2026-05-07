import { afterEach, describe, expect, it, vi } from "vitest"
import { _resetHandlersForTesting, emit, on } from "../src/events"
import type { DomainEvent } from "../src/contracts/events"

// Synthetic event types used only inside this suite. The real
// DomainEvent union is closed in `contracts/events.ts` ; we cast
// through `unknown` where TypeScript would otherwise reject our
// handcrafted shapes (the runtime doesn't care).
type FooEvent = { type: "test.foo"; payload: number; occurredAt: Date }
type BarEvent = { type: "test.bar"; payload: string; occurredAt: Date }

afterEach(() => {
  _resetHandlersForTesting()
})

describe("common/events.emit + on", () => {
  it("delivers the event payload to a registered handler", async () => {
    const handler = vi.fn()
    on<FooEvent>("test.foo", handler)
    const event: FooEvent = {
      type: "test.foo",
      payload: 42,
      occurredAt: new Date(),
    }
    await emit(event as unknown as DomainEvent)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it("calls every subscribed handler for the same event type", async () => {
    const a = vi.fn()
    const b = vi.fn()
    on<FooEvent>("test.foo", a)
    on<FooEvent>("test.foo", b)
    await emit({
      type: "test.foo",
      payload: 1,
      occurredAt: new Date(),
    } as unknown as DomainEvent)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("ignores handlers registered for a different event type", async () => {
    const fooHandler = vi.fn()
    const barHandler = vi.fn()
    on<FooEvent>("test.foo", fooHandler)
    on<BarEvent>("test.bar", barHandler)
    await emit({
      type: "test.foo",
      payload: 1,
      occurredAt: new Date(),
    } as unknown as DomainEvent)
    expect(fooHandler).toHaveBeenCalledTimes(1)
    expect(barHandler).not.toHaveBeenCalled()
  })

  it("is a no-op when no handler is registered for the event type", async () => {
    await expect(
      emit({
        type: "test.foo",
        payload: 1,
        occurredAt: new Date(),
      } as unknown as DomainEvent),
    ).resolves.toBeUndefined()
  })

  it("awaits async handlers in order", async () => {
    const calls: number[] = []
    on<FooEvent>("test.foo", async () => {
      await new Promise((r) => setTimeout(r, 10))
      calls.push(1)
    })
    on<FooEvent>("test.foo", () => {
      calls.push(2)
    })
    await emit({
      type: "test.foo",
      payload: 1,
      occurredAt: new Date(),
    } as unknown as DomainEvent)
    expect(calls).toEqual([1, 2])
  })

  it("does not let a thrown handler short-circuit the others", async () => {
    const broken = vi.fn(() => {
      throw new Error("boom")
    })
    const intact = vi.fn()
    on<FooEvent>("test.foo", broken)
    on<FooEvent>("test.foo", intact)
    await emit({
      type: "test.foo",
      payload: 1,
      occurredAt: new Date(),
    } as unknown as DomainEvent)
    expect(broken).toHaveBeenCalled()
    // Critical : the second handler still ran even though the first threw.
    expect(intact).toHaveBeenCalled()
  })
})

describe("common/events._resetHandlersForTesting", () => {
  it("clears every registered handler", async () => {
    const handler = vi.fn()
    on<FooEvent>("test.foo", handler)
    _resetHandlersForTesting()
    await emit({
      type: "test.foo",
      payload: 1,
      occurredAt: new Date(),
    } as unknown as DomainEvent)
    expect(handler).not.toHaveBeenCalled()
  })
})
