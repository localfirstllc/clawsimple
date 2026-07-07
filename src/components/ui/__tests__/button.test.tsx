import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../button";

describe("Button", () => {
  it("renders as a button element by default", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("applies variant and size data attributes", () => {
    render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toHaveAttribute("data-slot", "button");
    expect(btn).toHaveAttribute("data-variant", "destructive");
    expect(btn).toHaveAttribute("data-size", "lg");
  });

  it("defaults to default variant and default size", () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole("button", { name: "Default" });
    expect(btn).toHaveAttribute("data-variant", "default");
    expect(btn).toHaveAttribute("data-size", "default");
  });

  it("renders as a Slot when asChild is true", () => {
    render(
      <Button asChild>
        <span>Slot Child</span>
      </Button>
    );
    // When asChild is true, the child element should receive the button props
    const child = screen.getByText("Slot Child");
    expect(child).toBeInTheDocument();
    expect(child).toHaveAttribute("data-slot", "button");
  });

  it("passes through additional props", () => {
    render(<Button disabled aria-label="disabled button">Disabled</Button>);
    const btn = screen.getByRole("button", { name: "disabled button" });
    expect(btn).toBeDisabled();
  });

  it("handles click events", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    await user.click(screen.getByRole("button", { name: "Click" }));
    expect(clicked).toBe(true);
  });
});
