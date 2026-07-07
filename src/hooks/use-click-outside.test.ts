import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClickOutside } from "./use-click-outside";

describe("useClickOutside", () => {
  it("returns a ref", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useClickOutside(callback));
    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull();
  });

  it("fires callback when clicking outside the ref element", () => {
    const callback = vi.fn();
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    document.body.appendChild(outer);

    const { result } = renderHook(() => useClickOutside<HTMLDivElement>(callback));
    // Attach the ref's element
    Object.defineProperty(result.current, "current", {
      value: inner,
      writable: true,
    });

    act(() => {
      outer.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });

    // The callback should fire because the click was on `outer`, not `inner`
    expect(callback).toHaveBeenCalledTimes(1);
    document.body.removeChild(outer);
  });

  it("does NOT fire callback when clicking inside the ref element", () => {
    const callback = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);

    const { result } = renderHook(() => useClickOutside<HTMLDivElement>(callback));
    Object.defineProperty(result.current, "current", {
      value: div,
      writable: true,
    });

    act(() => {
      div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it("removes event listeners on unmount", () => {
    const callback = vi.fn();
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useClickOutside(callback));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function)
    );
    expect(removeSpy).toHaveBeenCalledWith(
      "touchstart",
      expect.any(Function)
    );
    removeSpy.mockRestore();
  });
});
