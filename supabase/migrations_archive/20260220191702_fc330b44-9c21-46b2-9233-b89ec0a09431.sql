
-- Allow staff/office/admin to delete rug_services (needed when editing a rug's services)
CREATE POLICY "Staff can delete rug_services"
ON public.rug_services FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR has_role(auth.uid(), 'checkin_staff'::app_role)
);
