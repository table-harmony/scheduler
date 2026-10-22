"use client";

import { Form as FormPrimitive } from "@base-ui/react/form";
import { cn } from "@/lib/utils";

function Form({
  className,
  ...props
}: React.ComponentProps<typeof FormPrimitive>) {
  return (
    <FormPrimitive
      data-slot="form"
      className={cn(className)}
      {...props}
    />
  );
}

export { Form };
