import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Section({ title, action, children, className, contentClassName }) {
  return (
    <Card className={cn("border-border bg-card", className)}>
      {(title || action) && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
          {action}
        </CardHeader>
      )}
      <CardContent className={cn("pt-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
