alter type public.estimate_status add value if not exists 'needs_office_review';
alter type public.estimate_status add value if not exists 'ready_to_send';
alter type public.estimate_status add value if not exists 'needs_revision';
