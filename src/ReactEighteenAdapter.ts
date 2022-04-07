/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';

import ReactDOMServer from 'react-dom/server';
import ShallowRenderer from 'react-test-renderer/shallow';
import TestUtils from 'react-dom/test-utils';
import has from 'has';
import {
	ConcurrentMode,
	ContextConsumer,
	ContextProvider,
	Element,
	ForwardRef,
	Fragment,
	isContextConsumer,
	isContextProvider,
	isElement,
	isForwardRef,
	isPortal,
	isSuspense,
	isValidElementType,
	Lazy,
	Memo,
	Portal,
	Profiler,
	StrictMode,
	Suspense,
} from 'react-is';
import { EnzymeAdapter } from 'enzyme';
import { typeOfNode } from 'enzyme/build/Utils';
import shallowEqual from 'enzyme-shallow-equal';
import {
	displayNameOfNode,
	elementToTree as utilElementToTree,
	nodeTypeFromType as utilNodeTypeFromType,
	mapNativeEventNames,
	propFromEvent,
	assertDomAvailable,
	withSetStateAllowed,
	createRenderWrapper,
	createMountWrapper,
	propsWithKeysAndRef,
	ensureKeyOrUndefined,
	simulateError,
	wrap,
	getMaskedContext,
	RootFinder,
	getNodeFromRootFinder,
	wrapWithWrappingComponent,
	getWrappingComponentMountRenderer,
	compareNodeTypeOf,
	spyMethod,
} from './enzyme-adapter-utils';
import findCurrentFiberUsingSlowPath from './findCurrentFiberUsingSlowPath';
import detectFiberTags from './detectFiberTags';

const FIBER_TAGS = detectFiberTags();

function nodeAndSiblingsArray(nodeWithSibling) {
	const array = [];
	let node = nodeWithSibling;
	while (node != null) {
		array.push(node);
		node = node.sibling;
	}

	return array;
}

function flatten(arr) {
	const result = [];
	const stack = [{ i: 0, array: arr }];
	while (stack.length) {
		const n = stack.pop();
		while (n.i < n.array.length) {
			const el = n.array[n.i];
			n.i += 1;
			if (Array.isArray(el)) {
				stack.push(n);
				stack.push({ i: 0, array: el });
				break;
			}
			result.push(el);
		}
	}

	return result;
}

function nodeTypeFromType(type) {
	if (type === Portal) {
		return 'portal';
	}

	return utilNodeTypeFromType(type);
}

function isMemo(type) {
	return compareNodeTypeOf(type, Memo);
}

function isLazy(type) {
	return compareNodeTypeOf(type, Lazy);
}

function unmemoType(type) {
	return isMemo(type) ? type.type : type;
}

function checkIsSuspenseAndCloneElement(el, { suspenseFallback }) {
	if (!isSuspense(el)) {
		return el;
	}

	let { children } = el.props;

	if (suspenseFallback) {
		const { fallback } = el.props;
		children = replaceLazyWithFallback(children, fallback);
	}

	function FakeSuspenseWrapper(props) {
		return React.createElement(el.type, { ...el.props, ...props }, children);
	}

	return React.createElement(FakeSuspenseWrapper, null, children);
}

function elementToTree(el) {
	if (!isPortal(el)) {
		return utilElementToTree(el, elementToTree);
	}

	const { children, containerInfo } = el;
	const props = { children, containerInfo };

	return {
		nodeType: 'portal',
		type: Portal,
		props,
		key: ensureKeyOrUndefined(el.key),
		ref: el.ref || null,
		instance: null,
		rendered: elementToTree(el.children),
	};
}

function toTree(vnode) {
	if (vnode == null) {
		return null;
	}
	// TODO(lmr): I'm not really sure I understand whether or not this is what
	// i should be doing, or if this is a hack for something i'm doing wrong
	// somewhere else. Should talk to sebastian about this perhaps
	const node = findCurrentFiberUsingSlowPath(vnode);
	switch (node.tag) {
		case FIBER_TAGS.HostRoot:
			return childrenToTree(node.child);
		case FIBER_TAGS.HostPortal: {
			const {
				stateNode: { containerInfo },
				memoizedProps: children,
			} = node;
			const props = { containerInfo, children };

			return {
				nodeType: 'portal',
				type: Portal,
				props,
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: null,
				rendered: childrenToTree(node.child),
			};
		}
		case FIBER_TAGS.ClassComponent:
			return {
				nodeType: 'class',
				type: node.type,
				props: { ...node.memoizedProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: node.stateNode,
				rendered: childrenToTree(node.child),
			};
		case FIBER_TAGS.FunctionalComponent:
			return {
				nodeType: 'function',
				type: node.type,
				props: { ...node.memoizedProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: null,
				rendered: childrenToTree(node.child),
			};
		case FIBER_TAGS.MemoClass:
			return {
				nodeType: 'class',
				type: node.elementType.type,
				props: { ...node.memoizedProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: node.stateNode,
				rendered: childrenToTree(node.child.child),
			};
		case FIBER_TAGS.MemoSFC: {
			let renderedNodes = flatten(nodeAndSiblingsArray(node.child).map(toTree));
			if (renderedNodes.length === 0) {
				renderedNodes = [node.memoizedProps.children];
			}

			return {
				nodeType: 'function',
				type: node.elementType,
				props: { ...node.memoizedProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: null,
				rendered: renderedNodes,
			};
		}
		case FIBER_TAGS.HostComponent: {
			let renderedNodes = flatten(nodeAndSiblingsArray(node.child).map(toTree));
			if (renderedNodes.length === 0) {
				renderedNodes = [node.memoizedProps.children];
			}

			return {
				nodeType: 'host',
				type: node.type,
				props: { ...node.memoizedProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: node.stateNode,
				rendered: renderedNodes,
			};
		}
		case FIBER_TAGS.HostText:
			return node.memoizedProps;
		case FIBER_TAGS.Fragment:
		case FIBER_TAGS.Mode:
		case FIBER_TAGS.ContextProvider:
		case FIBER_TAGS.ContextConsumer:
			return childrenToTree(node.child);
		case FIBER_TAGS.Profiler:
		case FIBER_TAGS.ForwardRef: {
			return {
				nodeType: 'function',
				type: node.type,
				props: { ...node.pendingProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: null,
				rendered: childrenToTree(node.child),
			};
		}
		case FIBER_TAGS.Suspense: {
			return {
				nodeType: 'function',
				type: Suspense,
				props: { ...node.memoizedProps },
				key: ensureKeyOrUndefined(node.key),
				ref: node.ref,
				instance: null,
				rendered: childrenToTree(node.child),
			};
		}
		case FIBER_TAGS.Lazy:
			return childrenToTree(node.child);
		case FIBER_TAGS.OffscreenComponent:
			return toTree(node.child);
		default:
			throw new Error(`Enzyme Internal Error: unknown node with tag ${node.tag}`);
	}
}

function childrenToTree(node) {
	if (!node) {
		return null;
	}
	const children = nodeAndSiblingsArray(node);
	if (children.length === 0) {
		return null;
	}
	if (children.length === 1) {
		return toTree(children[0]);
	}

	return flatten(children.map(toTree));
}

function nodeToHostNode(_node) {
	// NOTE(lmr): node could be a function component
	// which wont have an instance prop, but we can get the
	// host node associated with its return value at that point.
	// Although this breaks down if the return value is an array,
	// as is possible with React 16.
	let node = _node;
	while (node && !Array.isArray(node) && node.instance === null) {
		node = node.rendered;
	}
	// if the SFC returned null effectively, there is no host node.
	if (!node) {
		return null;
	}

	

	const mapper = (item) => {
		
		if (item && item.instance) return ReactDOM.findDOMNode(item.instance);

		return null;
	};
	if (Array.isArray(node)) {
		return node.map(mapper);
	}
	if (Array.isArray(node.rendered) && node.nodeType === 'class') {
		return node.rendered.map(mapper);
	}

	return mapper(node);
}

function replaceLazyWithFallback(node, fallback) {
	if (!node) {
		return null;
	}
	if (Array.isArray(node)) {
		return node.map((el) => replaceLazyWithFallback(el, fallback));
	}
	if (isLazy(node.type)) {
		return fallback;
	}

	return {
		...node,
		props: {
			...node.props,
			children: replaceLazyWithFallback(node.props.children, fallback),
		},
	};
}

function getEmptyStateValue() {
	// this handles a bug in React 16.0 - 16.2
	// see https://github.com/facebook/react/commit/39be83565c65f9c522150e52375167568a2a1459
	// also see https://github.com/facebook/react/pull/11965

	class EmptyState extends React.Component {
		render() {
			return null;
		}
	}
	const testRenderer = new ShallowRenderer();
	testRenderer.render(React.createElement(EmptyState));

	return testRenderer._instance.state;
}

// @ts-expect-error
const wrapAct = React.unstable_act || TestUtils.act;

function getProviderDefaultValue(Provider) {
	// React stores references to the Provider's defaultValue differently across versions.
	if ('_defaultValue' in Provider._context) {
		return Provider._context._defaultValue;
	}
	if ('_currentValue' in Provider._context) {
		return Provider._context._currentValue;
	}
	throw new Error('Enzyme Internal Error: can’t figure out how to get Provider’s default value');
}

function makeFakeElement(type) {
	return { $$typeof: Element, type };
}

function isStateful(Component) {
	return (
		Component.prototype &&
		(Component.prototype.isReactComponent || Array.isArray(Component.__reactAutoBindPairs)) // fallback for createClass components
	);
}

class ReactEighteenAdapter extends EnzymeAdapter {
	options: {}
	constructor() {
		super();
		// @ts-expect-error
		const { lifecycles } = this.options;
		this.options = {
			...this.options,
			enableComponentDidUpdateOnSetState: true, // TODO: remove, semver-major
			legacyContextMode: 'parent',
			lifecycles: {
				...lifecycles,
				componentDidUpdate: {
					onSetState: true,
				},
				getDerivedStateFromProps: {
					hasShouldComponentUpdateBug: false,
				},
				getSnapshotBeforeUpdate: true,
				setState: {
					skipsComponentDidUpdateOnNullish: true,
				},
				getChildContext: {
					calledByRenderer: false,
				},
				getDerivedStateFromError: true,
			},
		};
	}

	createMountRenderer(options) {
		globalThis.IS_REACT_ACT_ENVIRONMENT = true;
		
		assertDomAvailable('mount');
		if (has(options, 'suspenseFallback')) {
			throw new TypeError('`suspenseFallback` is not supported by the `mount` renderer');
		}

		const { attachTo, hydrateIn, wrappingComponentProps } = options;
		const domNode = hydrateIn || attachTo || global.document.createElement('div');
		let instance = null;
		let rootNode = null;
		const adapter = this;
		let unmountFlag = false;
		
		return {
			render(el, context, callback) {
				return wrapAct(() => {
					if (instance === null) {
						const { type, props, ref } = el;
						const wrapperProps = {
							Component: type,
							props,
							wrappingComponentProps,
							context,
							onRenderCb: (that) => { instance = that; },
							...(ref && { refProp: ref }),
						};
						const ReactWrapperComponent = createMountWrapper(el, { ...options, adapter });
						const wrappedEl = React.createElement(ReactWrapperComponent, wrapperProps);
						
						if (hydrateIn) {
							rootNode = hydrateRoot(domNode);
						} else {
							rootNode = createRoot(domNode);
						}
						rootNode.render(wrappedEl);
						// console.log('rendering to', { rootNode });
						if (typeof callback === 'function') {
							callback();
						}
					} else {
						instance.setChildProps(el.props, context, callback);
					}
				});
			},
			unmount() {
				// ReactWrapper calls getNode after unmounting, which will try to get nodes
				// un an unmounted tree. So we flag it instead.
				unmountFlag = true;
			},
			getNode() {				
				let node;

				wrapAct(() => {
					if (!instance) {
						node = null;
					}
	
					node = getNodeFromRootFinder(
						adapter.isCustomComponent,
						toTree(instance._reactInternals),
						options,
					);
				});
				if (unmountFlag) {
					wrapAct(() => {
						rootNode?.unmount();
						instance = null;
					});
				}

				return node;

			},
			wrap: wrapAct,
			simulateError(nodeHierarchy, rootNode, error) {
				const isErrorBoundary = ({ instance: elInstance, type }) => {
					if (type && type.getDerivedStateFromError) {
						return true;
					}

					return elInstance && elInstance.componentDidCatch;
				};

				const { instance: catchingInstance, type: catchingType } =
					nodeHierarchy.find(isErrorBoundary) || {};
					wrapAct(() => {
						simulateError(
							error,
							catchingInstance,
							rootNode,
							nodeHierarchy,
							nodeTypeFromType,
							adapter.displayNameOfNode,
							catchingType,
						);
					});
			},
			async simulateEvent(node, event, mock) {
				
				const hostNode = adapter.nodeToHostNode(node);
				const mappedEvent = mapNativeEventNames(event);
				const eventFn = TestUtils.Simulate[mappedEvent];
				// console.log('Simulate on', hostNode, mock);
				if (!eventFn) {
					throw new TypeError(`ReactWrapper::simulate() event '${event}' does not exist`);
				}
				await wrapAct(() => {
					eventFn(hostNode, mock);
				});
			},
			batchedUpdates: ReactDOM.unstable_batchedUpdates,
			getWrappingComponentRenderer() {
				return {
					...this,
					...getWrappingComponentMountRenderer({
						toTree: (inst) => toTree(inst._reactInternals),
						getMountWrapperInstance: () => instance,
					}),
				};
			},
			wrapInvoke: wrapAct,
		};
	}

	createShallowRenderer(options: any = {}) {
		const adapter = this;
		const renderer = new ShallowRenderer();
		const { suspenseFallback } = options;
		if (typeof suspenseFallback !== 'undefined' && typeof suspenseFallback !== 'boolean') {
			throw TypeError('`options.suspenseFallback` should be boolean or undefined');
		}
		let isDOM = false;
		let cachedNode = null;

		let lastComponent = null;
		let wrappedComponent = null;
		const sentinel = {};

		// wrap memo components with a PureComponent, or a class component with sCU
		const wrapPureComponent = (Component, compare) => {
			if (lastComponent !== Component) {
				if (isStateful(Component)) {
					wrappedComponent = class extends Component {};
					if (compare) {
						wrappedComponent.prototype.shouldComponentUpdate = (nextProps) =>
							// @ts-expect-error
							!compare(this.props, nextProps);
					} else {
						wrappedComponent.prototype.isPureReactComponent = true;
					}
				} else {
					let memoized = sentinel;
					let prevProps;
					wrappedComponent = function wrappedComponentFn(props, ...args) {
						const shouldUpdate =
							memoized === sentinel ||
							(compare ? !compare(prevProps, props) : !shallowEqual(prevProps, props));
						if (shouldUpdate) {
							memoized = Component({ ...Component.defaultProps, ...props }, ...args);
							prevProps = props;
						}

						return memoized;
					};
				}
				Object.assign(wrappedComponent, Component, {
					displayName: adapter.displayNameOfNode({ type: Component }),
				});
				lastComponent = Component;
			}

			return wrappedComponent;
		};

		// Wrap functional components on versions prior to 16.5,
		// to avoid inadvertently pass a `this` instance to it.
		const wrapFunctionalComponent = (Component) => {
			if (has(Component, 'defaultProps')) {
				if (lastComponent !== Component) {
					wrappedComponent = Object.assign(
						(props, ...args) => Component({ ...Component.defaultProps, ...props }, ...args),
						Component,
						{ displayName: adapter.displayNameOfNode({ type: Component }) },
					);
					lastComponent = Component;
				}

				return wrappedComponent;
			}

			return Component;
		};

		const renderElement = (elConfig, ...rest) => {
			const renderedEl = renderer.render(elConfig, ...rest);

			const typeIsExisted = !!(renderedEl && renderedEl.type);
			if (typeIsExisted) {
				const clonedEl = checkIsSuspenseAndCloneElement(renderedEl, { suspenseFallback });

				const elementIsChanged = clonedEl.type !== renderedEl.type;
				if (elementIsChanged) {
					return renderer.render({ ...elConfig, type: clonedEl.type }, ...rest);
				}
			}

			return renderedEl;
		};

		return {
			render(el, unmaskedContext, { providerValues = new Map() } = {}) {
				cachedNode = el;
				if (typeof el.type === 'string') {
					isDOM = true;
				} else if (isContextProvider(el)) {
					providerValues.set(el.type, el.props.value);
					const MockProvider = Object.assign((props) => props.children, el.type);

					return withSetStateAllowed(() => renderElement({ ...el, type: MockProvider }));
				} else if (isContextConsumer(el)) {
					const Provider = adapter.getProviderFromConsumer(el.type);
					const value = providerValues.has(Provider)
						? providerValues.get(Provider)
						: getProviderDefaultValue(Provider);
					const MockConsumer = Object.assign((props) => props.children(value), el.type);

					return withSetStateAllowed(() => renderElement({ ...el, type: MockConsumer }));
				} else {
					isDOM = false;
					let renderedEl = el;
					if (isLazy(renderedEl)) {
						throw TypeError('`React.lazy` is not supported by shallow rendering.');
					}

					renderedEl = checkIsSuspenseAndCloneElement(renderedEl, { suspenseFallback });
					const { type: Component } = renderedEl;

					const context = getMaskedContext(Component.contextTypes, unmaskedContext);

					if (isMemo(el.type)) {
						const { type: InnerComp, compare } = el.type;

						return withSetStateAllowed(() =>
							renderElement({ ...el, type: wrapPureComponent(InnerComp, compare) }, context),);
					}

					const isComponentStateful = isStateful(Component);

					if (!isComponentStateful && typeof Component === 'function') {
						return withSetStateAllowed(() =>
							renderElement({ ...renderedEl, type: wrapFunctionalComponent(Component) }, context),);
					}

					if (isComponentStateful) {
						if (
							renderer._instance &&
							el.props === renderer._instance.props &&
							!shallowEqual(context, renderer._instance.context)
						) {
							const { restore } = spyMethod(
								renderer,
								'_updateClassComponent',
								(originalMethod) =>
									function _updateClassComponent(...args) {
										const { props } = renderer._instance;
										const clonedProps = { ...props };
										renderer._instance.props = clonedProps;

										const result = originalMethod.apply(renderer, args);

										renderer._instance.props = props;
										restore();

										return result;
									},
							);
						}

						// fix react bug; see implementation of `getEmptyStateValue`
						const emptyStateValue = getEmptyStateValue();
						if (emptyStateValue) {
							Object.defineProperty(Component.prototype, 'state', {
								configurable: true,
								enumerable: true,
								get() {
									return null;
								},
								set(value) {
									if (value !== emptyStateValue) {
										Object.defineProperty(this, 'state', {
											configurable: true,
											enumerable: true,
											value,
											writable: true,
										});
									}
								},
							});
						}
					}

					return withSetStateAllowed(() => renderElement(renderedEl, context));
				}
			},
			unmount() {
				renderer.unmount();
			},
			getNode() {
				if (isDOM) {
					return elementToTree(cachedNode);
				}
				const output = renderer.getRenderOutput();

				return {
					nodeType: nodeTypeFromType(cachedNode.type),
					type: cachedNode.type,
					props: cachedNode.props,
					key: ensureKeyOrUndefined(cachedNode.key),
					ref: cachedNode.ref,
					instance: renderer._instance,
					rendered: Array.isArray(output)
						? flatten(output).map((el) => elementToTree(el))
						: elementToTree(output),
				};
			},
			simulateError(nodeHierarchy, rootNode, error) {
				simulateError(
					error,
					renderer._instance,
					cachedNode,
					nodeHierarchy.concat(cachedNode),
					nodeTypeFromType,
					adapter.displayNameOfNode,
					cachedNode.type,
				);
			},
			simulateEvent(node, event, ...args) {
				const handler = node.props[propFromEvent(event)];
				if (handler) {
					withSetStateAllowed(() => {
						// TODO(lmr): create/use synthetic events
						// TODO(lmr): emulate React's event propagation
						// ReactDOM.unstable_batchedUpdates(() => {
						handler(...args);
						// });
					});
				}
			},
			batchedUpdates(fn) {
				return fn();
				// return ReactDOM.unstable_batchedUpdates(fn);
			},
			// checkPropTypes(typeSpecs, values, location, hierarchy) {
			//   return checkPropTypes(typeSpecs, values, location, displayNameOfNode(cachedNode), () =>
			//     getComponentStack(hierarchy.concat([cachedNode])),);
			// },
			checkPropTypes(typeSpecs, values, location, hierarchy) {
				return true;
			},
		};
	}

	createStringRenderer(options) {
		if (has(options, 'suspenseFallback')) {
			throw new TypeError('`suspenseFallback` should not be specified in options of string renderer');
		}

		return {
			render(el, context) {
				if (options.context && (el.type.contextTypes || options.childContextTypes)) {
					const childContextTypes = {
						...(el.type.contextTypes || {}),
						...options.childContextTypes,
					};
					const ContextWrapper = createRenderWrapper(el, context, childContextTypes);

					return ReactDOMServer.renderToStaticMarkup(React.createElement(ContextWrapper));
				}

				return ReactDOMServer.renderToStaticMarkup(el);
			},
		};
	}

	// Provided a bag of options, return an `EnzymeRenderer`. Some options can be implementation
	// specific, like `attach` etc. for React, but not part of this interface explicitly.
	createRenderer(options) {
		switch (options.mode) {
			// @ts-expect-error
			case EnzymeAdapter.MODES.MOUNT:
				return this.createMountRenderer(options);
			// @ts-expect-error
			case EnzymeAdapter.MODES.SHALLOW:
				return this.createShallowRenderer(options);
			// @ts-expect-error
			case EnzymeAdapter.MODES.STRING:
				return this.createStringRenderer(options);
			default:
				throw new Error(`Enzyme Internal Error: Unrecognized mode: ${options.mode}`);
		}
	}

	wrap(element) {
		return wrap(element);
	}

	// converts an RSTNode to the corresponding JSX Pragma Element. This will be needed
	// in order to implement the `Wrapper.mount()` and `Wrapper.shallow()` methods, but should
	// be pretty straightforward for people to implement.
	nodeToElement(node) {
		if (!node || typeof node !== 'object') return null;
		const { type } = node;

		return React.createElement(unmemoType(type), propsWithKeysAndRef(node));
	}

	matchesElementType(node, matchingType) {
		if (!node) {
			return node;
		}
		const { type } = node;

		return unmemoType(type) === unmemoType(matchingType);
	}

	elementToNode(element) {
		return elementToTree(element);
	}

	nodeToHostNode(node, supportsArray = false) {
		const nodes = nodeToHostNode(node);
		if (Array.isArray(nodes) && !supportsArray) {
			// get the first non-null node
			return nodes.filter(Boolean)[0];
		}

		return nodes;
	}

	displayNameOfNode(node) {
		if (!node) return null;
		const { type, $$typeof } = node;
		const adapter = this;

		const nodeType = type || $$typeof;

		// newer node types may be undefined, so only test if the nodeType exists
		if (nodeType) {
			switch (nodeType) {
				case ConcurrentMode || NaN:
					return 'ConcurrentMode';
				case Fragment || NaN:
					return 'Fragment';
				case StrictMode || NaN:
					return 'StrictMode';
				case Profiler || NaN:
					return 'Profiler';
				case Portal || NaN:
					return 'Portal';
				case Suspense || NaN:
					return 'Suspense';
				default:
			}
		}

		const $$typeofType = type && type.$$typeof;

		switch ($$typeofType) {
			case ContextConsumer || NaN:
				return 'ContextConsumer';
			case ContextProvider || NaN:
				return 'ContextProvider';
			case Memo || NaN: {
				const nodeName = displayNameOfNode(node);

				return typeof nodeName === 'string' ? nodeName : `Memo(${adapter.displayNameOfNode(type)})`;
			}
			case ForwardRef || NaN: {
				if (type.displayName) {
					return type.displayName;
				}
				const name = adapter.displayNameOfNode({ type: type.render });

				return name ? `ForwardRef(${name})` : 'ForwardRef';
			}
			case Lazy || NaN: {
				return 'lazy';
			}
			default:
				return displayNameOfNode(node);
		}
	}

	isValidElement(element) {
		return isElement(element);
	}

	isValidElementType(object) {
		return !!object && isValidElementType(object);
	}

	isFragment(fragment) {
		return typeOfNode(fragment) === Fragment;
	}

	isCustomComponent(type) {
		const fakeElement = makeFakeElement(type);

		return (
			!!type &&
			(typeof type === 'function' ||
				isForwardRef(fakeElement) ||
				isContextProvider(fakeElement) ||
				isContextConsumer(fakeElement) ||
				isSuspense(fakeElement))
		);
	}

	isContextConsumer(type) {
		return !!type && isContextConsumer(makeFakeElement(type));
	}

	isCustomComponentElement(inst) {
		if (!inst || !this.isValidElement(inst)) {
			return false;
		}

		return this.isCustomComponent(inst.type);
	}

	getProviderFromConsumer(Consumer) {
		// React stores references to the Provider on a Consumer differently across versions.
		if (Consumer) {
			let Provider;
			if (Consumer._context) {
				// check this first, to avoid a deprecation warning
				({ Provider } = Consumer._context);
			} else if (Consumer.Provider) {
				({ Provider } = Consumer);
			}
			if (Provider) {
				return Provider;
			}
		}
		throw new Error('Enzyme Internal Error: can’t figure out how to get Provider from Consumer');
	}

	createElement(...args) {
		// @ts-expect-error
		return React.createElement(...args);
	}
	
	// @ts-expect-error
	wrapWithWrappingComponent(node, options) {
		return {
			RootFinder,
			node: wrapWithWrappingComponent(React.createElement, node, options),
		};
	}
}

export default ReactEighteenAdapter;
