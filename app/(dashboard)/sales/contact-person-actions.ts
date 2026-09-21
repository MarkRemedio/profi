"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import {
  normalizeContactPersonInput,
  type ContactPersonInput,
} from "@/lib/sales/contact-persons";

export type ContactPersonRow = {
  id: string;
  contactId: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  receivesInvoices: boolean;
  receivesReminders: boolean;
  isActive: boolean;
};

type Fail = { success: false; error: string };

function fail(error: string): Fail {
  return { success: false, error };
}

const PERSON_SELECT = {
  id: true,
  contactId: true,
  name: true,
  relationship: true,
  email: true,
  phone: true,
  receivesInvoices: true,
  receivesReminders: true,
  isActive: true,
} as const;

/** The contact must be the caller's own before any person row is touched. */
async function requireOwnContact(contactId: string, organizationId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true },
  });
}

/** Everyone attached to one contact, active or not — the dialog shows both. */
export async function listContactPersons(
  contactId: string
): Promise<{ success: true; persons: ContactPersonRow[] } | Fail> {
  try {
    if (!contactId) return fail("That contact could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const persons = await prisma.contactPerson.findMany({
      where: { contactId, organizationId: workspace.organizationId },
      select: PERSON_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return { success: true, persons };
  } catch (error) {
    console.error("Failed to list contact persons", error);
    return fail("Could not load this customer's contacts. Try again.");
  }
}

export async function createContactPerson(
  contactId: string,
  input: ContactPersonInput
): Promise<{ success: true; person: ContactPersonRow } | Fail> {
  try {
    if (!contactId) return fail("That contact could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const contact = await requireOwnContact(contactId, workspace.organizationId);
    if (!contact) return fail("That customer is no longer on your records.");

    const normalized = normalizeContactPersonInput(input);
    const person = await prisma.contactPerson.create({
      data: {
        organizationId: workspace.organizationId,
        contactId: contact.id,
        ...normalized,
      },
      select: PERSON_SELECT,
    });
    return { success: true, person };
  } catch (error) {
    console.error("Failed to add the contact person", error);
    return fail(error instanceof Error ? error.message : "Could not add this contact. Try again.");
  }
}

export async function updateContactPerson(
  personId: string,
  input: ContactPersonInput
): Promise<{ success: true; person: ContactPersonRow } | Fail> {
  try {
    if (!personId) return fail("That contact could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const existing = await prisma.contactPerson.findFirst({
      where: { id: personId, organizationId: workspace.organizationId },
      select: { id: true },
    });
    if (!existing) return fail("That contact is no longer on your records.");

    const normalized = normalizeContactPersonInput(input);
    const person = await prisma.contactPerson.update({
      where: { id: existing.id },
      data: normalized,
      select: PERSON_SELECT,
    });
    return { success: true, person };
  } catch (error) {
    console.error("Failed to update the contact person", error);
    return fail(error instanceof Error ? error.message : "Could not update this contact. Try again.");
  }
}

/**
 * Flips whether a person is active. Deactivating (rather than deleting) keeps
 * them listed but stops any invoice or reminder emails immediately.
 */
export async function setContactPersonActive(
  personId: string,
  isActive: boolean
): Promise<{ success: true; person: ContactPersonRow } | Fail> {
  try {
    if (!personId) return fail("That contact could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const existing = await prisma.contactPerson.findFirst({
      where: { id: personId, organizationId: workspace.organizationId },
      select: { id: true },
    });
    if (!existing) return fail("That contact is no longer on your records.");

    const person = await prisma.contactPerson.update({
      where: { id: existing.id },
      data: { isActive },
      select: PERSON_SELECT,
    });
    return { success: true, person };
  } catch (error) {
    console.error("Failed to change the contact person's status", error);
    return fail("Could not update this contact. Try again.");
  }
}

export async function deleteContactPerson(
  personId: string
): Promise<{ success: true } | Fail> {
  try {
    if (!personId) return fail("That contact could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const existing = await prisma.contactPerson.findFirst({
      where: { id: personId, organizationId: workspace.organizationId },
      select: { id: true },
    });
    if (!existing) return fail("That contact is no longer on your records.");

    await prisma.contactPerson.delete({ where: { id: existing.id } });
    return { success: true };
  } catch (error) {
    console.error("Failed to remove the contact person", error);
    return fail("Could not remove this contact. Try again.");
  }
}
