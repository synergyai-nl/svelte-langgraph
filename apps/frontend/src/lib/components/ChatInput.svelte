<script lang="ts">
	import SubmitButton from './SubmitButton.svelte';
	import * as m from '$lib/paraglide/messages.js';
    import {Textarea} from "$lib/components/ui/textarea";
    import { X } from "lucide-svelte";
	interface Props {
		value: string;
		isStreaming?: boolean;
		onSubmit: () => void;
		placeholder?: string;
	}
	let {
		value = $bindable(''),
		isStreaming = false,
		onSubmit,
		placeholder = m.chat_input_placeholder()
	}: Props = $props();

	let isEmpty = $derived(!(value ?? '').trim());
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false) {
			event.preventDefault();
			onSubmit();
		}
	}
    function clearInput() {
        value = '';
    }
</script>
<div class="fixed right-0 bottom-0 left-0 bg-transparent">
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form
			id="input_form"
			onsubmit={onSubmit}
			class="rounded-xl border border-gray-200 bg-white py-2 pr-3 pl-4 shadow-md dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-800/20"
		>
            <div class="flex flex-row justify-between ">
                <div class="flex-1 relative">
        <Textarea id="user-input" disabled={isStreaming} {placeholder} rows={2} name="message" bind:value onkeydown={handleKeyPress}
                class="flex w-full resize-none max-h-16 overflow-y-auto">
        </Textarea>
                    {#if !isEmpty && !isStreaming}
                        <button type="button" class="absolute right-1 top-1  p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300  transition-colors"
                                onclick={clearInput}>
                            <X class="w-4.5 h-4.5 " />
                        </button>
                    {/if}
                </div>
                <div class="flex shrink-0 items-start pt-1 pr-3">
                    <SubmitButton {isStreaming} disabled={isStreaming || isEmpty} />
                </div>
            </div>
		</form>
	</div>
</div>
