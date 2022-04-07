export default function detectFiberTags() {
	// Lifted from ReactWorkTags.js
	const FunctionComponent = 0;
	const ClassComponent = 1;
	const HostRoot = 3; // Root of a host tree. Could be nested inside another node.
	const HostPortal = 4; // A subtree. Could be an entry point to a different renderer.
	const HostComponent = 5;
	const HostText = 6;
	const Fragment = 7;
	const Mode = 8;
	const ContextConsumer = 9;
	const ContextProvider = 10;
	const ForwardRef = 11;
	const Profiler = 12;
	const SuspenseComponent = 13;
	const MemoComponent = 14;
	const SimpleMemoComponent = 15;
	const LazyComponent = 16;
	const OffscreenComponent = 22;

	return {
		HostRoot,
		ClassComponent,
		Fragment,
		FunctionalComponent: FunctionComponent,
		MemoSFC: SimpleMemoComponent,
		MemoClass: MemoComponent,
		HostPortal,
		HostComponent,
		HostText,
		Mode,
		ContextConsumer,
		ContextProvider,
		ForwardRef,
		Profiler,
		Suspense: SuspenseComponent,
		Lazy: LazyComponent,
		OffscreenComponent,
	};
};
