import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('ic-skeleton rounded-md border border-intel-border/30', className)}
      {...props}
    />
  );
}
