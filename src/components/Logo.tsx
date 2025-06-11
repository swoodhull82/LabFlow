
import type { SVGProps } from 'react';
import { APP_NAME } from '@/lib/constants';
import { FlaskConical } from 'lucide-react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <div className="flex items-center gap-2">
      <FlaskConical
        className="h-8 w-8 text-primary"
        aria-label={`${APP_NAME} Logo Icon`}
        {...props}
      />
      <span className="text-xl font-headline font-semibold text-foreground">{APP_NAME}</span>
    </div>
  );
}
