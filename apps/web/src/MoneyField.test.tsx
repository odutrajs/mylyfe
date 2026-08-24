import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoneyField } from "./MoneyField";

describe("MoneyField", () => {
  it("calls onChange with parsed numeric value when typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MoneyField label="Valor" value={0} onChange={onChange} />);

    const input = screen.getByLabelText("Valor");
    await user.clear(input);
    await user.type(input, "1234,5");

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(1234.5);
  });
});
