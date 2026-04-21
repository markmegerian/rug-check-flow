revoke execute on function public.ensure_estimate_send_batch_internal(uuid, uuid, timestamptz, text, text) from authenticated;
revoke execute on function public.ensure_estimate_send_batch(uuid, uuid, timestamptz, text, text) from authenticated;

grant execute on function public.ensure_estimate_send_batch_internal(uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.ensure_estimate_send_batch(uuid, uuid, timestamptz, text, text) to service_role;
