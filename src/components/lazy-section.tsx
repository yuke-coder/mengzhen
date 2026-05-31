"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";

interface LazySectionProps {
    children: ReactNode;
    className?: string;
    id?: string;
    rootMargin?: string;
    placeholder?: ReactNode;
}

export default function LazySection({
    children,
    className,
    id,
    rootMargin = "200px 0px",
    placeholder,
}: LazySectionProps) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        if (typeof IntersectionObserver === "undefined") {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(element);
                }
            },
            { rootMargin }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [rootMargin]);

    return (
        <div ref={ref} className={className} id={id}>
            {isVisible ? children : placeholder ?? <div />}
        </div>
    );
}
